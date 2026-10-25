-- CLIKIUM · Esquema inicial multi-rubro (barberías, peluquerías, uñas, spa, estética)
-- Aplicar con `npx supabase db push` o pegando en Supabase > SQL Editor (una sola vez).
-- Reservas con intervalos [inicio, fin) sin solapamiento por profesional.

create extension if not exists btree_gist with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Catálogo
-- ─────────────────────────────────────────────────────────────
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (length(name) between 2 and 120),
  category text not null default 'barberia'
    check (category in ('barberia', 'peluqueria', 'unas', 'spa', 'estetica', 'otro')),
  tagline text check (length(tagline) <= 160),
  address text check (length(address) <= 200),
  phone text check (length(phone) <= 20),
  timezone text not null default 'America/Santiago',
  brand_color text not null default '#2F3A56' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text,
  min_notice_min integer not null default 30 check (min_notice_min between 0 and 2880),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 180),
  cancel_notice_min integer not null default 120 check (cancel_notice_min between 0 and 2880),
  max_active_per_phone integer not null default 3 check (max_active_per_phone between 1 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(name) between 2 and 120),
  description text,
  price_clp integer not null check (price_clp >= 0),
  duration_min integer not null check (duration_min between 15 and 480 and duration_min % 15 = 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (id, business_id)
);

-- "staff" = profesional genérico (barbero, estilista, manicurista, terapeuta…)
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(name) between 2 and 120),
  role_title text check (length(role_title) <= 60),
  avatar_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (id, business_id)
);

create table public.staff_services (
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null,
  service_id uuid not null,
  primary key (staff_id, service_id),
  foreign key (staff_id, business_id) references public.staff(id, business_id) on delete cascade,
  foreign key (service_id, business_id) references public.services(id, business_id) on delete cascade
);

create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- PostgreSQL DOW: domingo = 0
  opens_at time not null,
  closes_at time not null,
  check (opens_at < closes_at),
  unique (staff_id, weekday)
);

create table public.staff_breaks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (starts_at < ends_at)
);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (starts_at < ends_at)
);

-- ─────────────────────────────────────────────────────────────
-- Reservas
-- ─────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  service_id uuid not null,
  staff_id uuid not null,
  client_name text not null check (length(client_name) between 2 and 80),
  client_phone text not null check (length(client_phone) between 8 and 20),
  price_clp integer not null check (price_clp >= 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  source text not null default 'web' check (source in ('web', 'panel')),
  notes text check (length(notes) <= 500),
  -- Credencial del cliente para ver/cancelar. ~244 bits aleatorios. Nunca usar el id como credencial.
  public_token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('client', 'business')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at),
  foreign key (service_id, business_id) references public.services(id, business_id),
  foreign key (staff_id, business_id) references public.staff(id, business_id),
  constraint bookings_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status = 'confirmed')
);

create index bookings_business_start_idx on public.bookings(business_id, start_at);
create index bookings_phone_idx on public.bookings(business_id, client_phone) where status = 'confirmed';
create index time_off_staff_start_idx on public.time_off(staff_id, starts_at);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Equipo del negocio (usuarios de Supabase Auth)
-- ─────────────────────────────────────────────────────────────
create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  staff_id uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members(user_id);

-- ─────────────────────────────────────────────────────────────
-- Rate limiting (ventana fija) — solo service_role
-- ─────────────────────────────────────────────────────────────
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits(window_start);

-- ─────────────────────────────────────────────────────────────
-- Helpers de autorización
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Owner ve todo el negocio; staff solo sus propias reservas.
create or replace function public.can_see_booking(p_business_id uuid, p_staff_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and (m.role = 'owner' or m.staff_id = p_staff_id)
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_services enable row level security;
alter table public.working_hours enable row level security;
alter table public.staff_breaks enable row level security;
alter table public.time_off enable row level security;
alter table public.bookings enable row level security;
alter table public.business_members enable row level security;
alter table public.rate_limits enable row level security;

revoke all on table public.businesses, public.services, public.staff, public.staff_services,
  public.working_hours, public.staff_breaks, public.time_off, public.bookings,
  public.business_members, public.rate_limits from anon, authenticated;

-- Público (anon): solo catálogo activo. NUNCA reservas ni teléfonos.
create policy anon_businesses on public.businesses for select to anon using (is_active);
create policy anon_services on public.services for select to anon using (
  is_active and exists (select 1 from public.businesses b where b.id = business_id and b.is_active)
);
create policy anon_staff on public.staff for select to anon using (
  is_active and exists (select 1 from public.businesses b where b.id = business_id and b.is_active)
);
create policy anon_staff_services on public.staff_services for select to anon using (
  exists (select 1 from public.staff s where s.id = staff_id and s.is_active)
  and exists (select 1 from public.services v where v.id = service_id and v.is_active)
);
grant select on table public.businesses, public.services, public.staff, public.staff_services to anon;

-- Panel (authenticated): solo negocios donde es miembro.
create policy member_businesses on public.businesses for select to authenticated using (public.is_member(id));
create policy member_services on public.services for select to authenticated using (public.is_member(business_id));
create policy member_staff on public.staff for select to authenticated using (public.is_member(business_id));
create policy member_staff_services on public.staff_services for select to authenticated using (public.is_member(business_id));
create policy member_working_hours on public.working_hours for select to authenticated using (
  exists (select 1 from public.staff s where s.id = staff_id and public.is_member(s.business_id))
);
create policy member_breaks on public.staff_breaks for select to authenticated using (
  exists (select 1 from public.staff s where s.id = staff_id and public.is_member(s.business_id))
);
create policy member_time_off on public.time_off for select to authenticated using (
  exists (select 1 from public.staff s where s.id = staff_id and public.is_member(s.business_id))
);
create policy member_bookings on public.bookings for select to authenticated using (
  public.can_see_booking(business_id, staff_id)
);
create policy self_memberships on public.business_members for select to authenticated using (user_id = auth.uid());

grant select on table public.businesses, public.services, public.staff, public.staff_services,
  public.working_hours, public.staff_breaks, public.time_off, public.bookings,
  public.business_members to authenticated;
-- Las escrituras del panel pasan por funciones RPC con validación explícita.

-- ─────────────────────────────────────────────────────────────
-- Disponibilidad
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
      shop.timezone,
      shop.min_notice_min,
      ((p_date + wh.opens_at) at time zone shop.timezone) as opening,
      ((p_date + wh.closes_at) at time zone shop.timezone) as closing
    from public.businesses shop
    join public.services s on s.business_id = shop.id and s.id = p_service_id and s.is_active
    join public.staff_services ss on ss.business_id = shop.id and ss.service_id = s.id
    join public.staff st on st.id = ss.staff_id and st.business_id = shop.id and st.is_active
    join public.working_hours wh on wh.staff_id = st.id and wh.weekday = extract(dow from p_date)
    where shop.slug = p_slug and shop.is_active
      and (p_staff_id is null or st.id = p_staff_id)
      and p_date between (now() at time zone shop.timezone)::date
                     and (now() at time zone shop.timezone)::date + shop.max_days_ahead
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
  select g.staff_id, g.staff_name, to_char(g.start_at at time zone g.timezone, 'HH24:MI') as slot_time
  from generated g
  where g.start_at >= now() + make_interval(mins => g.min_notice_min)
    and not exists (
      select 1 from public.bookings bk
      where bk.staff_id = g.staff_id and bk.status = 'confirmed'
        and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(g.start_at, g.end_at, '[)')
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
-- Crear reserva pública (solo service_role desde el Route Handler)
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- Gestión por el cliente vía token (solo service_role)
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_booking_by_token(p_token text)
returns table(
  booking_id uuid, status text, start_at timestamptz, end_at timestamptz, price_clp integer,
  client_name text, service_name text, duration_min integer, staff_name text,
  business_name text, business_slug text, business_address text, business_phone text,
  business_category text, brand_color text, timezone text, can_cancel boolean
)
language sql stable security definer set search_path = '' as $$
  select b.id, b.status, b.start_at, b.end_at, b.price_clp, b.client_name,
    s.name, s.duration_min, st.name,
    shop.name, shop.slug, shop.address, shop.phone, shop.category, shop.brand_color, shop.timezone,
    (b.status = 'confirmed' and b.start_at - make_interval(mins => shop.cancel_notice_min) > now())
  from public.bookings b
  join public.businesses shop on shop.id = b.business_id
  join public.services s on s.id = b.service_id
  join public.staff st on st.id = b.staff_id
  where p_token ~ '^[0-9a-f]{64}$' and b.public_token = p_token;
$$;

create or replace function public.cancel_booking_by_token(p_token text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_booking record;
begin
  select b.id, b.status, b.start_at, shop.cancel_notice_min
    into v_booking
  from public.bookings b
  join public.businesses shop on shop.id = b.business_id
  where p_token ~ '^[0-9a-f]{64}$' and b.public_token = p_token
  for update of b;

  if not found then return 'NOT_FOUND'; end if;
  if v_booking.status <> 'confirmed' then return 'NOT_CANCELLABLE'; end if;
  if v_booking.start_at - make_interval(mins => v_booking.cancel_notice_min) <= now() then
    return 'TOO_LATE';
  end if;

  update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = 'client'
  where id = v_booking.id;
  return 'CANCELLED';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Panel: cambio de estado (authenticated, valida membresía)
-- ─────────────────────────────────────────────────────────────
create or replace function public.panel_set_booking_status(p_booking_id uuid, p_status text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_booking record;
begin
  if p_status not in ('confirmed', 'cancelled', 'completed', 'no_show') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  select b.id, b.business_id, b.staff_id, b.status into v_booking
  from public.bookings b where b.id = p_booking_id for update;

  if not found or not public.can_see_booking(v_booking.business_id, v_booking.staff_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  begin
    update public.bookings set
      status = p_status,
      cancelled_at = case when p_status = 'cancelled' then now() else null end,
      cancelled_by = case when p_status = 'cancelled' then 'business' else null end
    where id = v_booking.id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;
  return p_status;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Rate limit: devuelve true si la solicitud está permitida.
-- ─────────────────────────────────────────────────────────────
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Limpieza oportunista de ventanas antiguas.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos de funciones
-- ─────────────────────────────────────────────────────────────
revoke all on function public.is_member(uuid), public.is_owner(uuid), public.can_see_booking(uuid, uuid)
  from public, anon;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.can_see_booking(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.available_slots(text, uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.available_slots(text, uuid, date, uuid) to anon, service_role;

revoke all on function public.create_public_booking(text, uuid, uuid, date, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_booking(text, uuid, uuid, date, text, text, text) to service_role;

revoke all on function public.get_booking_by_token(text), public.cancel_booking_by_token(text) from public, anon, authenticated;
grant execute on function public.get_booking_by_token(text), public.cancel_booking_by_token(text) to service_role;

revoke all on function public.panel_set_booking_status(uuid, text) from public, anon;
grant execute on function public.panel_set_booking_status(uuid, text) to authenticated;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

comment on table public.bookings is 'Reservas privadas. Lectura solo para miembros del negocio vía RLS.';
comment on column public.bookings.public_token is 'Credencial del cliente para /reserva/[token]. No exponer en listados.';
