-- OBSOLETO: esquema original con tablas `barbers`. NO EJECUTAR.
-- Reemplazado por supabase/migrations/ (tabla `staff`). Se conserva solo como referencia histórica.

-- CLIKIUM BARBER MVP · PostgreSQL / Supabase
-- Ejecutar una sola vez en Supabase > SQL Editor como propietario de proyecto.
-- Zona horaria por negocio, reservas con intervalos [inicio, fin) sin solapamiento.

create extension if not exists btree_gist;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (length(name) between 2 and 120),
  tagline text,
  address text,
  timezone text not null default 'America/Santiago',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(name) between 2 and 120),
  description text,
  price_clp integer not null check (price_clp >= 0),
  duration_min integer not null check (duration_min between 15 and 240 and duration_min % 15 = 0),
  is_active boolean not null default true,
  unique (id, business_id)
);

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(name) between 2 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (id, business_id)
);

create table if not exists public.barber_services (
  business_id uuid not null references public.businesses(id) on delete cascade,
  barber_id uuid not null,
  service_id uuid not null,
  primary key (barber_id, service_id),
  foreign key (barber_id, business_id) references public.barbers(id, business_id) on delete cascade,
  foreign key (service_id, business_id) references public.services(id, business_id) on delete cascade
);

create table if not exists public.working_hours (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- PostgreSQL DOW: domingo = 0
  opens_at time without time zone not null,
  closes_at time without time zone not null,
  check (opens_at < closes_at),
  unique (barber_id, weekday)
);

create table if not exists public.barber_breaks (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time without time zone not null,
  ends_at time without time zone not null,
  check (starts_at < ends_at)
);

create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (starts_at < ends_at)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  service_id uuid not null,
  barber_id uuid not null,
  client_name text not null check (length(client_name) between 2 and 80),
  client_phone text not null check (length(client_phone) between 8 and 20),
  price_clp integer not null check (price_clp >= 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  created_at timestamptz not null default now(),
  check (start_at < end_at),
  foreign key (service_id, business_id) references public.services(id, business_id),
  foreign key (barber_id, business_id) references public.barbers(id, business_id),
  constraint bookings_no_overlap exclude using gist (
    barber_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status = 'confirmed')
);

create index if not exists bookings_business_start_idx on public.bookings(business_id, start_at);
create index if not exists time_off_barber_start_idx on public.time_off(barber_id, starts_at);

-- RLS: datos públicos solo lectura del catálogo, NUNCA las reservas o teléfonos.
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.barber_services enable row level security;
alter table public.working_hours enable row level security;
alter table public.barber_breaks enable row level security;
alter table public.time_off enable row level security;
alter table public.bookings enable row level security;

create policy "public_active_businesses" on public.businesses
  for select to anon using (is_active = true);
create policy "public_active_services" on public.services
  for select to anon using (
    is_active = true and exists (
      select 1 from public.businesses b where b.id = business_id and b.is_active
    )
  );
create policy "public_active_barbers" on public.barbers
  for select to anon using (
    is_active = true and exists (
      select 1 from public.businesses b where b.id = business_id and b.is_active
    )
  );
create policy "public_active_eligibility" on public.barber_services
  for select to anon using (
    exists (select 1 from public.barbers b where b.id = barber_id and b.business_id = business_id and b.is_active)
    and exists (select 1 from public.services s where s.id = service_id and s.business_id = business_id and s.is_active)
  );

revoke all on table public.businesses, public.services, public.barbers, public.barber_services,
  public.working_hours, public.barber_breaks, public.time_off, public.bookings from anon, authenticated;
grant select on table public.businesses, public.services, public.barbers, public.barber_services to anon;

-- Horarios disponibles: validación repetida en DB para no confiar en cliente.
create or replace function public.available_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_barber_id uuid default null
)
returns table(barber_id uuid, barber_name text, slot_time text)
language sql stable security definer
set search_path = ''
as $$
  with candidates as (
    select
      b.id as barber_id,
      b.name as barber_name,
      s.duration_min,
      shop.timezone,
      ((p_date + wh.opens_at) at time zone shop.timezone) as opening,
      ((p_date + wh.closes_at) at time zone shop.timezone) as closing
    from public.businesses shop
    join public.services s on s.business_id = shop.id and s.id = p_service_id and s.is_active
    join public.barber_services bs on bs.business_id = shop.id and bs.service_id = s.id
    join public.barbers b on b.id = bs.barber_id and b.business_id = shop.id and b.is_active
    join public.working_hours wh on wh.barber_id = b.id and wh.weekday = extract(dow from p_date)
    where shop.slug = p_slug and shop.is_active
      and (p_barber_id is null or b.id = p_barber_id)
      and p_date between (now() at time zone shop.timezone)::date
                     and (now() at time zone shop.timezone)::date + 30
  ),
  generated as (
    select c.*, g.start_at, g.start_at + make_interval(mins => c.duration_min) as end_at
    from candidates c
    cross join lateral generate_series(
      c.opening,
      c.closing - make_interval(mins => c.duration_min),
      interval '15 minutes'
    ) g(start_at)
  )
  select
    g.barber_id,
    g.barber_name,
    to_char(g.start_at at time zone g.timezone, 'HH24:MI') as slot_time
  from generated g
  where g.start_at >= now() + interval '10 minutes'
    and not exists (
      select 1 from public.bookings bk
      where bk.barber_id = g.barber_id and bk.status = 'confirmed'
        and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(g.start_at, g.end_at, '[)')
    )
    and not exists (
      select 1 from public.time_off t
      where t.barber_id = g.barber_id
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(g.start_at, g.end_at, '[)')
    )
    and not exists (
      select 1 from public.barber_breaks br
      where br.barber_id = g.barber_id and br.weekday = extract(dow from p_date)
        and tstzrange(
          ((p_date + br.starts_at) at time zone g.timezone),
          ((p_date + br.ends_at) at time zone g.timezone),
          '[)'
        ) && tstzrange(g.start_at, g.end_at, '[)')
    )
  order by slot_time, barber_name;
$$;

-- Crear reserva: solo puede ser invocada con SERVICE_ROLE desde el Route Handler.
-- Trata conflictos simultáneos con exclusión GiST; en 'cualquiera' intenta el siguiente barbero.
create or replace function public.create_public_booking(
  p_slug text,
  p_service_id uuid,
  p_barber_id uuid,
  p_date date,
  p_time text,
  p_client_name text,
  p_client_phone text
)
returns table(booking_id uuid, assigned_barber_id uuid, assigned_barber_name text, slot_time text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_duration integer;
  v_price integer;
  v_business_id uuid;
  v_timezone text;
  v_start timestamptz;
  v_id uuid;
  v_slot record;
  v_clean_name text := trim(p_client_name);
  v_clean_phone text := trim(p_client_phone);
begin
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or length(v_clean_name) not between 2 and 80
    or v_clean_phone !~ '^\+?[0-9 -]{8,20}$'
    or length(regexp_replace(v_clean_phone, '[^0-9]', '', 'g')) not between 8 and 15
  then
    raise exception 'INVALID_BOOKING' using errcode = 'P0001';
  end if;

  select s.duration_min, s.price_clp, shop.id, shop.timezone
    into v_duration, v_price, v_business_id, v_timezone
  from public.businesses shop
  join public.services s on s.business_id = shop.id
  where shop.slug = p_slug and shop.is_active and s.id = p_service_id and s.is_active;

  if not found then
    raise exception 'INVALID_BOOKING' using errcode = 'P0001';
  end if;

  v_start := ((p_date + p_time::time) at time zone v_timezone);

  for v_slot in
    select available.barber_id, available.barber_name, available.slot_time
    from public.available_slots(p_slug, p_service_id, p_date, p_barber_id) available
    where available.slot_time = p_time
    order by available.barber_name
  loop
    begin
      insert into public.bookings (
        business_id, service_id, barber_id, client_name, client_phone,
        price_clp, start_at, end_at
      ) values (
        v_business_id, p_service_id, v_slot.barber_id, v_clean_name, v_clean_phone,
        v_price, v_start, v_start + make_interval(mins => v_duration)
      ) returning id into v_id;

      booking_id := v_id;
      assigned_barber_id := v_slot.barber_id;
      assigned_barber_name := v_slot.barber_name;
      slot_time := v_slot.slot_time;
      return next;
      return;
    exception when exclusion_violation then
      -- Hubo una reserva concurrente. Reintenta con otro barbero si no hubo preferencia.
      null;
    end;
  end loop;

  raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
end;
$$;

revoke all on function public.available_slots(text, uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.available_slots(text, uuid, date, uuid) to anon, service_role;
revoke all on function public.create_public_booking(text, uuid, uuid, date, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_booking(text, uuid, uuid, date, text, text, text) to service_role;

comment on table public.bookings is 'Reservas privadas. No conceder SELECT público.';
comment on function public.create_public_booking(text, uuid, uuid, date, text, text, text)
  is 'Solo backend con service_role; agrega protección anti-spam/CAPTCHA antes de publicar.';
