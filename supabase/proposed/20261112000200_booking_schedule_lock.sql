-- ═════════════════════════════════════════════════════════════
-- PROPUESTA (auditoría P2-03 y P2-04) · NO EJECUTAR EN PRODUCCIÓN HASTA APROBARLA
-- Reservas públicas y bloqueos de horario serializados por negocio
-- ═════════════════════════════════════════════════════════════
-- Re-ejecutable (create or replace; mismas firmas y permisos). Riesgos que corrige (potenciales, no explotados):
--   P2-03 · el máximo de reservas activas por teléfono se cuenta y luego se inserta sin bloqueo: dos reservas
--           simultáneas con el mismo teléfono pueden pasar ambas y superar el máximo.
--   P2-04 · una reserva que revisó la disponibilidad justo antes de que se guarde un bloqueo puede quedar dentro de él,
--           y el aviso de «reservas afectadas» del bloqueo no la cuenta.
-- Solución: un bloqueo consultivo por negocio ('aurabook:schedule:<negocio>') en create_public_booking y en
-- save_time_off. Un solo bloqueo por negocio (no por profesional) para que no haya interbloqueos; el orden con el
-- bloqueo de cuota (bookings_monthly_quota) es siempre agenda → cuota. Costo: las reservas públicas de UN negocio se
-- procesan de a una (milisegundos cada una); negocios distintos no se esperan entre sí.

create or replace function public.create_public_booking(
  p_slug text,
  p_service_id uuid,
  p_staff_id uuid,
  p_date date,
  p_time text,
  p_client_name text,
  p_client_phone text
)
returns table(booking_id uuid, public_token text, assigned_staff_id uuid, assigned_staff_name text, slot_time text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_duration integer;
  v_price integer;
  v_business_id uuid;
  v_timezone text;
  v_max_active integer;
  v_start timestamptz;
  v_id uuid;
  v_token text;
  v_slot record;
  v_clean_name text := trim(p_client_name);
  v_clean_phone text := regexp_replace(trim(p_client_phone), '\s+', ' ', 'g');
  v_phone_digits text := regexp_replace(p_client_phone, '[^0-9]', '', 'g');
begin
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or length(v_clean_name) not between 2 and 80
    or v_clean_phone !~ '^\+?[0-9 -]{8,20}$'
    or length(v_phone_digits) not between 8 and 15
  then
    raise exception 'INVALID_BOOKING' using errcode = 'P0001';
  end if;

  select s.duration_min, s.price_clp, shop.id, shop.timezone, shop.max_active_per_phone
    into v_duration, v_price, v_business_id, v_timezone, v_max_active
  from public.businesses shop
  join public.services s on s.business_id = shop.id
  where shop.slug = p_slug and shop.is_active and s.id = p_service_id and s.is_active;

  if not found then
    raise exception 'INVALID_BOOKING' using errcode = 'P0001';
  end if;

  -- P2-03 / P2-04: una reserva pública a la vez por negocio. Así el conteo por teléfono y la revisión de bloqueos no
  -- se adelantan a otra reserva o a un bloqueo que se está guardando en ese mismo instante (save_time_off toma el
  -- mismo bloqueo). Se libera al terminar la transacción.
  perform pg_advisory_xact_lock(hashtextextended('aurabook:schedule:' || v_business_id::text, 0));

  -- Anti-abuso: límite de reservas futuras activas por teléfono en este negocio.
  if (
    select count(*) from public.bookings b
    where b.business_id = v_business_id and b.status = 'confirmed' and b.start_at > now()
      and regexp_replace(b.client_phone, '[^0-9]', '', 'g') = v_phone_digits
  ) >= v_max_active then
    raise exception 'TOO_MANY_BOOKINGS' using errcode = 'P0001';
  end if;

  v_start := ((p_date + p_time::time) at time zone v_timezone);

  for v_slot in
    select a.staff_id, a.staff_name, a.slot_time
    from public.available_slots(p_slug, p_service_id, p_date, p_staff_id) a
    where a.slot_time = p_time
    order by a.staff_name
  loop
    -- Un bloqueo guardado mientras esta reserva esperaba su turno ya es visible aquí: ese horario no se toma.
    if exists (
      select 1 from public.time_off t
      where t.staff_id = v_slot.staff_id
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(v_start, v_start + make_interval(mins => v_duration), '[)')
    ) then
      continue;
    end if;
    begin
      insert into public.bookings (
        business_id, service_id, staff_id, client_name, client_phone, price_clp, start_at, end_at, source
      ) values (
        v_business_id, p_service_id, v_slot.staff_id, v_clean_name, v_clean_phone,
        v_price, v_start, v_start + make_interval(mins => v_duration), 'web'
      ) returning id, bookings.public_token into v_id, v_token;

      booking_id := v_id;
      public_token := v_token;
      assigned_staff_id := v_slot.staff_id;
      assigned_staff_name := v_slot.staff_name;
      slot_time := v_slot.slot_time;
      return next;
      return;
    exception when exclusion_violation then
      null; -- Reserva concurrente: probar siguiente profesional (si "sin preferencia").
    end;
  end loop;

  raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
end;
$$;
revoke all on function public.create_public_booking(text, uuid, uuid, date, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_booking(text, uuid, uuid, date, text, text, text) to service_role;

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

  -- Mismo bloqueo que create_public_booking (ver encabezado): el conteo de reservas afectadas ya incluye cualquier
  -- reserva que se haya confirmado mientras tanto.
  perform pg_advisory_xact_lock(hashtextextended('aurabook:schedule:' || p_business_id::text, 0));

  insert into public.time_off (staff_id, business_id, starts_at, ends_at, reason)
  select distinct x, p_business_id, p_starts_at, p_ends_at, v_reason from unnest(p_staff_ids) x;

  select count(*) into v_affected
  from public.bookings b
  where b.business_id = p_business_id and b.status = 'confirmed' and b.staff_id = any(p_staff_ids)
    and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');
  return v_affected;
end;
$$;
revoke all on function public.save_time_off(uuid, uuid[], timestamptz, timestamptz, text) from public, anon;
grant execute on function public.save_time_off(uuid, uuid[], timestamptz, timestamptz, text) to authenticated;
