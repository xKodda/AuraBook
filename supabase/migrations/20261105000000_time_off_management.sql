-- ═════════════════════════════════════════════════════════════
-- Bloqueos de agenda: vacaciones, feriados e imprevistos (tabla time_off, que ya existía)
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. La página pública ya respeta time_off (available_slots); aquí se agregan las funciones
-- para que owner/admin creen y quiten bloqueos. Un bloqueo nunca cancela reservas: se informa cuántas quedan
-- dentro del rango para que el negocio avise a esos clientes.

alter table public.time_off drop constraint if exists time_off_reason_length;
alter table public.time_off add constraint time_off_reason_length check (reason is null or length(reason) <= 80);

-- Crea el mismo bloqueo para uno o varios profesionales («todo el equipo» = todos los activos).
-- Devuelve cuántas reservas confirmadas quedan dentro del bloqueo.
create or replace function public.save_time_off(
  p_business_id uuid,
  p_staff_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null
)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason text := nullif(trim(p_reason), '');
  v_affected integer;
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at
    or p_ends_at <= now() or p_ends_at - p_starts_at > interval '366 days'
  then
    raise exception 'INVALID_TIME_OFF' using errcode = 'P0001';
  end if;
  if v_reason is not null and length(v_reason) > 80 then
    raise exception 'INVALID_TIME_OFF' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_staff_ids, 1), 0) = 0 or (
    select count(*) from public.staff st
    where st.business_id = p_business_id and st.is_active and st.id = any(p_staff_ids)
  ) <> (select count(distinct x) from unnest(p_staff_ids) x) then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.time_off (staff_id, business_id, starts_at, ends_at, reason)
  select distinct x, p_business_id, p_starts_at, p_ends_at, v_reason from unnest(p_staff_ids) x;

  select count(*) into v_affected
  from public.bookings b
  where b.business_id = p_business_id and b.status = 'confirmed' and b.staff_id = any(p_staff_ids)
    and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');
  return v_affected;
end;
$$;

-- Quita uno o varios bloqueos del negocio (un bloqueo de «todo el equipo» son varias filas).
create or replace function public.delete_time_off(p_business_id uuid, p_ids uuid[])
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_deleted integer;
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.time_off t where t.business_id = p_business_id and t.id = any(p_ids);
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'TIME_OFF_NOT_FOUND' using errcode = 'P0001';
  end if;
  return v_deleted;
end;
$$;

revoke all on function public.save_time_off(uuid, uuid[], timestamptz, timestamptz, text) from public, anon;
grant execute on function public.save_time_off(uuid, uuid[], timestamptz, timestamptz, text) to authenticated;
revoke all on function public.delete_time_off(uuid, uuid[]) from public, anon;
grant execute on function public.delete_time_off(uuid, uuid[]) to authenticated;
