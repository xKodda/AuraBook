-- ═════════════════════════════════════════════════════════════
-- Sobrecupos en reservas manuales e ingresos por rango de fechas
-- ═════════════════════════════════════════════════════════════
-- Sin pérdida de datos: agrega una columna con valor por defecto, recrea la restricción de solapamiento
-- (más permisiva solo para los sobrecupos) y reemplaza panel_create_booking agregando un parámetro opcional.

-- ─────────────────────────────────────────────────────────────
-- 1. Marca de sobrecupo
-- ─────────────────────────────────────────────────────────────
-- Un sobrecupo es una reserva que el equipo agrega a sabiendas de que choca con otra (o con el horario).
-- Sigue ocupando la hora: available_slots considera todas las reservas confirmadas, así que la página
-- pública nunca ofrece ese horario. Solo queda fuera de la restricción de solapamiento.
alter table public.bookings add column if not exists is_overbook boolean not null default false;

alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist (
  staff_id with =,
  tstzrange(start_at, end_at, '[)') with &&
) where (status = 'confirmed' and not is_overbook);

-- La columna nueva también debe poder leerse desde el panel (ver 20261025000000, sección 4).
grant select (is_overbook) on table public.bookings to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Reserva manual con sobrecupo opcional
-- ─────────────────────────────────────────────────────────────
-- Misma validación que la versión anterior. Sin sobrecupo, una hora ocupada devuelve SLOT_TAKEN;
-- con p_overbook = true la reserva se guarda igual, marcada como sobrecupo.
drop function if exists public.panel_create_booking(uuid, uuid, uuid, text, text, timestamptz, text);

create function public.panel_create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_client_name text,
  p_client_phone text,
  p_start_at timestamptz,
  p_notes text default null,
  p_overbook boolean default false
)
returns table(booking_id uuid, public_token text, start_at timestamptz, end_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_duration integer;
  v_price integer;
  v_end timestamptz;
  v_id uuid;
  v_token text;
  v_clean_name text := trim(p_client_name);
  v_clean_phone text := regexp_replace(trim(p_client_phone), '\s+', ' ', 'g');
  v_phone_digits text := regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g');
begin
  if not public.can_see_booking(p_business_id, p_staff_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_clean_name is null or length(v_clean_name) not between 2 and 80 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  if v_clean_phone is null or v_clean_phone !~ '^\+?[0-9 -]{8,20}$'
    or length(v_phone_digits) not between 8 and 15
  then
    raise exception 'INVALID_PHONE' using errcode = 'P0001';
  end if;

  if p_start_at is null or date_trunc('minute', p_start_at) <> p_start_at then
    raise exception 'INVALID_START' using errcode = 'P0001';
  end if;

  if p_notes is not null and length(trim(p_notes)) > 500 then
    raise exception 'INVALID_NOTES' using errcode = 'P0001';
  end if;

  select s.duration_min, s.price_clp into v_duration, v_price
  from public.services s
  where s.id = p_service_id and s.business_id = p_business_id and s.is_active;

  if not found then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.staff st
    join public.staff_services ss on ss.staff_id = st.id and ss.business_id = st.business_id
    where st.id = p_staff_id and st.business_id = p_business_id and st.is_active
      and ss.service_id = p_service_id
  ) then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_end := p_start_at + make_interval(mins => v_duration);

  begin
    insert into public.bookings (
      business_id, service_id, staff_id, client_name, client_phone,
      price_clp, start_at, end_at, source, notes, is_overbook
    ) values (
      p_business_id, p_service_id, p_staff_id, v_clean_name, v_clean_phone,
      v_price, p_start_at, v_end, 'panel', nullif(trim(p_notes), ''), coalesce(p_overbook, false)
    ) returning id, bookings.public_token into v_id, v_token;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  booking_id := v_id;
  public_token := v_token;
  start_at := p_start_at;
  end_at := v_end;
  return next;
end;
$$;

revoke all on function public.panel_create_booking(uuid, uuid, uuid, text, text, timestamptz, text, boolean) from public, anon;
grant execute on function public.panel_create_booking(uuid, uuid, uuid, text, text, timestamptz, text, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Ingresos por día en un rango (fechas locales del negocio, ambos extremos incluidos)
-- ─────────────────────────────────────────────────────────────
-- Cuenta las reservas confirmadas y completadas (las canceladas y las inasistencias no suman).
-- security invoker: aplica RLS, así que un profesional solo suma sus propias reservas.
-- El rango se limita a ~1 año para que la consulta siga siendo liviana.
create or replace function public.panel_revenue(p_business_id uuid, p_from date, p_to date)
returns table(day date, total_clp bigint, bookings integer)
language sql stable security invoker set search_path = '' as $$
  select (b.start_at at time zone shop.timezone)::date as day,
         sum(b.price_clp)::bigint as total_clp,
         count(*)::integer as bookings
  from public.bookings b
  join public.businesses shop on shop.id = b.business_id
  where b.business_id = p_business_id
    and b.status in ('confirmed', 'completed')
    and p_from <= p_to and p_to - p_from <= 370
    and b.start_at >= (p_from::timestamp at time zone shop.timezone)
    and b.start_at < ((p_to + 1)::timestamp at time zone shop.timezone)
  group by 1
  order by 1;
$$;

revoke all on function public.panel_revenue(uuid, date, date) from public, anon;
grant execute on function public.panel_revenue(uuid, date, date) to authenticated;
