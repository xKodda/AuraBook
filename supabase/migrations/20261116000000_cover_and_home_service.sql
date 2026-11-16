-- ═════════════════════════════════════════════════════════════
-- AuraBook · Foto de portada y servicios a domicilio
-- ═════════════════════════════════════════════════════════════
-- Portada: foto ancha (local o equipo) arriba de la página de reservas, en todos los planes. Se guarda en el mismo
-- bucket que el logo, en la carpeta del negocio.
-- A domicilio: opción del negocio (home_service). Solo si está activa, cada servicio puede marcarse «a domicilio».
-- Una reserva de un servicio a domicilio:
--   • suma el recargo del negocio (home_fee_clp) al precio, y lo guarda aparte para mostrarlo desglosado;
--   • pide la dirección del cliente (set_public_booking_address, igual que el correo con set_public_booking_contact);
--   • bloquea los minutos de traslado después de la cita (block_end_at), para que el profesional no reciba otra
--     reserva mientras se mueve. La regla que impide citas solapadas usa ese fin de bloqueo.
-- Aditiva: sin la opción activa, todo funciona igual que antes (block_end_at = end_at).

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas
-- ─────────────────────────────────────────────────────────────
alter table public.businesses
  add column if not exists cover_url text check (length(cover_url) <= 500),
  add column if not exists home_service boolean not null default false,
  add column if not exists home_fee_clp integer not null default 0 check (home_fee_clp between 0 and 1000000),
  add column if not exists home_travel_min integer not null default 0 check (home_travel_min between 0 and 240),
  -- Comunas o zona que cubre, en texto libre («Providencia, Ñuñoa y Las Condes»).
  add column if not exists home_area text check (length(home_area) <= 200);

alter table public.services
  add column if not exists at_home boolean not null default false;

alter table public.bookings
  add column if not exists at_home boolean not null default false,
  add column if not exists home_fee_clp integer not null default 0 check (home_fee_clp >= 0),
  add column if not exists client_address text check (length(client_address) <= 200),
  add column if not exists client_address_ref text check (length(client_address_ref) <= 200),
  add column if not exists block_end_at timestamptz;

update public.bookings set block_end_at = end_at where block_end_at is null;
alter table public.bookings alter column block_end_at set not null;
alter table public.bookings drop constraint if exists bookings_block_after_end;
alter table public.bookings add constraint bookings_block_after_end check (block_end_at >= end_at);

grant select (at_home, home_fee_clp, client_address, client_address_ref, block_end_at) on table public.bookings to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Reservas a domicilio: recargo y traslado se calculan en la base de datos, no los manda el cliente
-- ─────────────────────────────────────────────────────────────
create or replace function public.bookings_home_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_home boolean;
  v_fee integer;
  v_travel integer;
begin
  if tg_op = 'INSERT' then
    select s.at_home and shop.home_service, shop.home_fee_clp, shop.home_travel_min
      into v_home, v_fee, v_travel
    from public.services s join public.businesses shop on shop.id = s.business_id
    where s.id = new.service_id and s.business_id = new.business_id;
    new.at_home := coalesce(v_home, false);
    if new.at_home then
      new.home_fee_clp := v_fee;
      new.price_clp := new.price_clp + v_fee;
      new.block_end_at := new.end_at + make_interval(mins => v_travel);
    else
      new.home_fee_clp := 0;
      new.block_end_at := new.end_at;
    end if;
  elsif new.end_at is distinct from old.end_at then
    -- Si cambia el horario, el traslado se mantiene igual.
    new.block_end_at := new.end_at + (old.block_end_at - old.end_at);
  else
    new.block_end_at := old.block_end_at;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_home_service on public.bookings;
create trigger bookings_home_service before insert or update of start_at, end_at, block_end_at on public.bookings
  for each row execute function public.bookings_home_service();

-- Citas sin solapar (como 20261101000000), ahora contando el traslado después de las citas a domicilio.
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist (
  staff_id with =,
  tstzrange(start_at, block_end_at, '[)') with &&
) where (status = 'confirmed' and not is_overbook);

-- ─────────────────────────────────────────────────────────────
-- 3. Horas disponibles (misma firma de 20261114000000): un servicio a domicilio necesita además su traslado libre
-- ─────────────────────────────────────────────────────────────
create or replace function public.available_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_staff_id uuid default null
)
returns table(staff_id uuid, staff_name text, slot_time text)
language sql stable security definer
set search_path = ''
as $$
  with candidates as (
    select
      st.id as staff_id,
      st.name as staff_name,
      s.duration_min,
      case when s.at_home and shop.home_service then shop.home_travel_min else 0 end as travel_min,
      shop.timezone,
      shop.min_notice_min,
      shop.slot_interval_min,
      ((p_date + wh.opens_at) at time zone shop.timezone) as opening,
      ((p_date + wh.closes_at) at time zone shop.timezone) as closing
    from public.businesses shop
    join public.services s on s.business_id = shop.id and s.id = p_service_id and s.is_active
    join public.staff_services ss on ss.business_id = shop.id and ss.service_id = s.id
    join public.staff st on st.id = ss.staff_id and st.business_id = shop.id and st.is_active
    join public.working_hours wh on wh.staff_id = st.id and wh.weekday = extract(dow from p_date)
    where shop.slug = p_slug and shop.is_active
      and (p_staff_id is null or st.id = p_staff_id)
      and st.id in (select public.business_bookable_staff(shop.id))
      and not public.business_month_full(shop.id, p_date)
      and p_date between (now() at time zone shop.timezone)::date
                     and (now() at time zone shop.timezone)::date + shop.max_days_ahead
  ),
  generated as (
    select c.*, g.start_at,
      g.start_at + make_interval(mins => c.duration_min) as end_at,
      g.start_at + make_interval(mins => c.duration_min + c.travel_min) as block_end_at
    from candidates c
    cross join lateral generate_series(
      c.opening,
      c.closing - make_interval(mins => c.duration_min),
      make_interval(mins => c.slot_interval_min)
    ) g(start_at)
  )
  select g.staff_id, g.staff_name, to_char(g.start_at at time zone g.timezone, 'HH24:MI') as slot_time
  from generated g
  where g.start_at >= now() + make_interval(mins => g.min_notice_min)
    and not exists (
      select 1 from public.bookings bk
      where bk.staff_id = g.staff_id and bk.status = 'confirmed'
        and tstzrange(bk.start_at, bk.block_end_at, '[)') && tstzrange(g.start_at, g.block_end_at, '[)')
    )
    and not exists (
      select 1 from public.time_off t
      where t.staff_id = g.staff_id
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(g.start_at, g.end_at, '[)')
    )
    and not exists (
      select 1 from public.staff_breaks br
      where br.staff_id = g.staff_id and br.weekday = extract(dow from p_date)
        and tstzrange(
          ((p_date + br.starts_at) at time zone g.timezone),
          ((p_date + br.ends_at) at time zone g.timezone),
          '[)'
        ) && tstzrange(g.start_at, g.end_at, '[)')
    )
  order by slot_time, staff_name;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Dirección del cliente (solo service_role, desde POST /api/bookings, justo después de crear la reserva)
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_public_booking_address(p_booking_id uuid, p_address text, p_reference text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_address text := regexp_replace(trim(coalesce(p_address, '')), '\s+', ' ', 'g');
  v_reference text := nullif(regexp_replace(trim(coalesce(p_reference, '')), '\s+', ' ', 'g'), '');
begin
  if length(v_address) not between 5 and 200 or coalesce(length(v_reference), 0) > 200
    or v_address ~ '[<>]|https?://|[[:cntrl:]]' or coalesce(v_reference, '') ~ '[<>]|https?://|[[:cntrl:]]' then
    raise exception 'INVALID_ADDRESS' using errcode = 'P0001';
  end if;
  update public.bookings set client_address = v_address, client_address_ref = v_reference
  where id = p_booking_id and at_home and source = 'web' and client_address is null
    and created_at > now() - interval '10 minutes';
  if not found then
    raise exception 'INVALID_BOOKING' using errcode = 'P0001';
  end if;
end;
$$;

-- El aviso al negocio incluye la dirección (mismo resultado de 20261029000000, con los datos de domicilio).
create or replace function public.booking_notification(p_booking_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'bookingId', b.id,
    'manageToken', b.public_token,
    'startAt', b.start_at,
    'endAt', b.end_at,
    'priceClp', b.price_clp,
    'clientName', b.client_name,
    'clientPhone', b.client_phone,
    'clientEmail', b.client_email,
    'reminderOptIn', b.reminder_opt_in,
    'serviceName', s.name,
    'staffName', st.name,
    'businessName', shop.name,
    'businessSlug', shop.slug,
    'businessAddress', coalesce(shop.address, ''),
    'businessPhone', coalesce(shop.phone, ''),
    'timezone', shop.timezone,
    'atHome', b.at_home,
    'homeFeeClp', b.home_fee_clp,
    'clientAddress', coalesce(b.client_address, ''),
    'clientAddressRef', coalesce(b.client_address_ref, ''),
    'ownerEmails', coalesce((
      select jsonb_agg(distinct u.email)
      from public.business_members m
      join auth.users u on u.id = m.user_id
      where m.business_id = shop.id and m.role = 'owner' and u.email is not null
    ), '[]'::jsonb)
  )
  from public.bookings b
  join public.businesses shop on shop.id = b.business_id
  join public.services s on s.id = b.service_id
  join public.staff st on st.id = b.staff_id
  where b.id = p_booking_id;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Configuración (owner/admin)
-- ─────────────────────────────────────────────────────────────
create or replace function public.update_home_service(
  p_business_id uuid, p_enabled boolean, p_fee_clp integer, p_travel_min integer, p_area text
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_area text := nullif(regexp_replace(trim(coalesce(p_area, '')), '\s+', ' ', 'g'), '');
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_enabled is null or p_fee_clp is null or p_fee_clp not between 0 and 1000000
    or p_travel_min is null or p_travel_min not between 0 and 240 or p_travel_min % 5 <> 0
    or coalesce(length(v_area), 0) > 200 or coalesce(v_area, '') ~ '[<>]|https?://|[[:cntrl:]]' then
    raise exception 'INVALID_HOME_SERVICE' using errcode = 'P0001';
  end if;
  update public.businesses set
    home_service = p_enabled, home_fee_clp = p_fee_clp, home_travel_min = p_travel_min, home_area = v_area
  where id = p_business_id;
end;
$$;

create or replace function public.set_service_at_home(p_service_id uuid, p_at_home boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_business uuid;
begin
  select s.business_id into v_business from public.services s where s.id = p_service_id;
  if v_business is null or not public.has_business_role(v_business, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.services set at_home = coalesce(p_at_home, false) where id = p_service_id;
end;
$$;

create or replace function public.set_business_cover(p_business_id uuid, p_cover_url text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_cover_url is not null and (
    length(p_cover_url) > 500
    or p_cover_url !~ ('^https://[a-z0-9.-]+/storage/v1/object/public/business-logos/'
                       || p_business_id::text || '/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$')
  ) then
    raise exception 'INVALID_COVER' using errcode = 'P0001';
  end if;
  update public.businesses set cover_url = p_cover_url where id = p_business_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function
  public.bookings_home_service(),
  public.set_public_booking_address(uuid, text, text),
  public.update_home_service(uuid, boolean, integer, integer, text),
  public.set_service_at_home(uuid, boolean),
  public.set_business_cover(uuid, text)
from public, anon, authenticated;

grant execute on function public.set_public_booking_address(uuid, text, text) to service_role;
grant execute on function
  public.update_home_service(uuid, boolean, integer, integer, text),
  public.set_service_at_home(uuid, boolean),
  public.set_business_cover(uuid, text)
to authenticated;
