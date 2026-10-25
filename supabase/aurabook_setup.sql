-- AuraBook · Instalación completa (7 migraciones). Pegar en Supabase > SQL Editor y ejecutar UNA vez.
-- Todo corre en una transacción: si algo falla, no queda nada a medias.
-- Archivo GENERADO a partir de supabase/migrations/ (no editar a mano). Úsalo solo para instalar en un proyecto vacío.
begin;

-- ════════ 20261023000000_init.sql ════════
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

-- ════════ 20261024100000_saas_roles_and_permissions.sql ════════
-- AuraBook · Migración Fase 1: Fundamentos SaaS, Roles Multi-Tenant y Onboarding Atómico
-- Esta migración es puramente aditiva y no destructiva. Compatible con 20261023000000_init.sql.

-- 1. Ampliar roles en business_members para incorporar 'admin'
alter table public.business_members
  drop constraint if exists business_members_role_check;

alter table public.business_members
  add constraint business_members_role_check
  check (role in ('owner', 'admin', 'staff'));

-- 2. Función auxiliar para verificar si un usuario es administrador o dueño
create or replace function public.is_admin_or_owner(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- 3. Actualizar función can_see_booking para que 'admin' también vea toda la agenda del local
create or replace function public.can_see_booking(p_business_id uuid, p_staff_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and (m.role in ('owner', 'admin') or m.staff_id = p_staff_id)
  );
$$;

-- 4. Función atómica de Onboarding: Crea negocio y asigna al usuario como 'owner'
create or replace function public.create_business_with_owner(
  p_name text,
  p_slug text,
  p_category text default 'barberia',
  p_tagline text default null,
  p_address text default null,
  p_phone text default null,
  p_timezone text default 'America/Santiago',
  p_brand_color text default '#2F3A56'
)
returns table(business_id uuid, slug text, name text, category text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_clean_name text := trim(p_name);
  v_clean_slug text := lower(trim(p_slug));
  v_clean_color text := upper(trim(p_brand_color));
begin
  -- Validación de autenticación
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  -- Validaciones de entrada
  if length(v_clean_name) not between 2 and 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  if v_clean_slug !~ '^[a-z0-9-]{3,60}$' then
    raise exception 'INVALID_SLUG' using errcode = 'P0001';
  end if;

  if p_category not in ('barberia', 'peluqueria', 'unas', 'spa', 'estetica', 'otro') then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;

  if v_clean_color !~ '^#[0-9A-F]{6}$' then
    v_clean_color := '#2F3A56';
  end if;

  -- Verificar si el slug ya existe
  if exists (select 1 from public.businesses b where b.slug = v_clean_slug) then
    raise exception 'SLUG_ALREADY_EXISTS' using errcode = '23505';
  end if;

  -- 1. Insertar el negocio
  insert into public.businesses (
    name,
    slug,
    category,
    tagline,
    address,
    phone,
    timezone,
    brand_color
  ) values (
    v_clean_name,
    v_clean_slug,
    p_category,
    nullif(trim(p_tagline), ''),
    nullif(trim(p_address), ''),
    nullif(trim(p_phone), ''),
    coalesce(nullif(trim(p_timezone), ''), 'America/Santiago'),
    v_clean_color
  ) returning id into v_business_id;

  -- 2. Asignar al creador como 'owner'
  insert into public.business_members (
    business_id,
    user_id,
    role
  ) values (
    v_business_id,
    v_user_id,
    'owner'
  );

  return query
  select b.id, b.slug, b.name, b.category
  from public.businesses b
  where b.id = v_business_id;
end;
$$;

-- 5. Crear reserva manual desde el panel (ej. cliente por teléfono o presencial)
create or replace function public.panel_create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_client_name text,
  p_client_phone text,
  p_start_at timestamptz,
  p_notes text default null
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
begin
  -- Solo miembros del local con permiso para ver o gestionar este staff
  if not public.can_see_booking(p_business_id, p_staff_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if length(v_clean_name) not between 2 and 80 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  -- Obtener duración y precio del servicio asegurando que pertenece al negocio
  select s.duration_min, s.price_clp into v_duration, v_price
  from public.services s
  where s.id = p_service_id and s.business_id = p_business_id and s.is_active;

  if not found then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Verificar que el profesional pertenezca al negocio
  if not exists (
    select 1 from public.staff st
    where st.id = p_staff_id and st.business_id = p_business_id and st.is_active
  ) then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_end := p_start_at + make_interval(mins => v_duration);

  begin
    insert into public.bookings (
      business_id, service_id, staff_id, client_name, client_phone,
      price_clp, start_at, end_at, source, notes
    ) values (
      p_business_id, p_service_id, p_staff_id, v_clean_name, v_clean_phone,
      v_price, p_start_at, v_end, 'panel', nullif(trim(p_notes), '')
    ) returning id, bookings.public_token into v_id, v_token;

    booking_id := v_id;
    public_token := v_token;
    start_at := p_start_at;
    end_at := v_end;
    return next;
    return;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;
end;
$$;

-- 6. Permisos de funciones
revoke all on function public.is_admin_or_owner(uuid) from public, anon;
grant execute on function public.is_admin_or_owner(uuid) to authenticated, service_role;

revoke all on function public.create_business_with_owner(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_business_with_owner(text, text, text, text, text, text, text, text) to authenticated;

revoke all on function public.panel_create_booking(uuid, uuid, uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.panel_create_booking(uuid, uuid, uuid, text, text, timestamptz, text) to authenticated;

-- ════════ 20261025000000_phase1_tenant_hardening.sql ════════
-- AuraBook · Fase 1: endurecimiento multi-tenant
-- Aditiva y no destructiva: no elimina filas ni columnas. Si algún dato existente viola
-- una nueva restricción, la migración falla completa (transacción) en lugar de corregirlo en silencio.
--
-- 1. Toda tabla de disponibilidad lleva business_id con FK compuesta (staff_id, business_id).
-- 2. business_members.staff_id solo puede apuntar a un profesional del mismo negocio.
-- 3. Helper genérico de roles y visibilidad del equipo para owner/admin.
-- 4. bookings.public_token deja de ser legible por usuarios del panel.
-- 5. Onboarding: correo verificado, límite de negocios, zona horaria válida, slugs reservados.
-- 6. Reserva manual: el profesional debe ofrecer el servicio y el teléfono debe ser válido.

-- ─────────────────────────────────────────────────────────────
-- 1. business_id en working_hours, staff_breaks y time_off
-- ─────────────────────────────────────────────────────────────
alter table public.working_hours add column if not exists business_id uuid;
alter table public.staff_breaks add column if not exists business_id uuid;
alter table public.time_off add column if not exists business_id uuid;

update public.working_hours t set business_id = s.business_id
  from public.staff s where s.id = t.staff_id and t.business_id is null;
update public.staff_breaks t set business_id = s.business_id
  from public.staff s where s.id = t.staff_id and t.business_id is null;
update public.time_off t set business_id = s.business_id
  from public.staff s where s.id = t.staff_id and t.business_id is null;

-- Completa business_id desde el profesional si no viene informado (mantiene compatibles
-- los inserts existentes). Si viene informado y no coincide, la FK compuesta lo rechaza.
create or replace function public.fill_business_id_from_staff()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.business_id is null then
    select s.business_id into new.business_id from public.staff s where s.id = new.staff_id;
  end if;
  return new;
end;
$$;

create trigger working_hours_fill_business before insert or update of staff_id, business_id
  on public.working_hours for each row execute function public.fill_business_id_from_staff();
create trigger staff_breaks_fill_business before insert or update of staff_id, business_id
  on public.staff_breaks for each row execute function public.fill_business_id_from_staff();
create trigger time_off_fill_business before insert or update of staff_id, business_id
  on public.time_off for each row execute function public.fill_business_id_from_staff();

alter table public.working_hours alter column business_id set not null;
alter table public.staff_breaks alter column business_id set not null;
alter table public.time_off alter column business_id set not null;

alter table public.working_hours add constraint working_hours_staff_same_business
  foreign key (staff_id, business_id) references public.staff(id, business_id) on delete cascade;
alter table public.staff_breaks add constraint staff_breaks_staff_same_business
  foreign key (staff_id, business_id) references public.staff(id, business_id) on delete cascade;
alter table public.time_off add constraint time_off_staff_same_business
  foreign key (staff_id, business_id) references public.staff(id, business_id) on delete cascade;

create index if not exists working_hours_business_idx on public.working_hours(business_id);
create index if not exists staff_breaks_business_idx on public.staff_breaks(business_id);
create index if not exists time_off_business_idx on public.time_off(business_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Membresías: vínculo con profesional del mismo negocio
-- ─────────────────────────────────────────────────────────────
-- Se agrega la FK compuesta antes de retirar la simple, para no quedar sin integridad.
alter table public.business_members add constraint business_members_staff_same_business
  foreign key (staff_id, business_id) references public.staff(id, business_id)
  on delete set null (staff_id);
alter table public.business_members drop constraint if exists business_members_staff_id_fkey;

-- Un perfil profesional se vincula a lo sumo a un usuario.
create unique index if not exists business_members_staff_unique
  on public.business_members(business_id, staff_id) where staff_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 3. Helper de roles y visibilidad del equipo
-- ─────────────────────────────────────────────────────────────
create or replace function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;

-- Owner/admin ven todas las membresías de su negocio (las políticas permisivas se suman con OR).
create policy admin_team_memberships on public.business_members for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));

-- ─────────────────────────────────────────────────────────────
-- 4. public_token fuera del alcance del panel
-- ─────────────────────────────────────────────────────────────
-- El token es la credencial del cliente; un miembro del equipo no debe poder suplantarlo.
-- Al agregar columnas a bookings, incluirlas también en este GRANT.
revoke select on table public.bookings from authenticated;
grant select (
  id, business_id, service_id, staff_id, client_name, client_phone, price_clp,
  start_at, end_at, status, source, notes, cancelled_at, cancelled_by, created_at, updated_at
) on table public.bookings to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Zona horaria válida en businesses
-- ─────────────────────────────────────────────────────────────
-- Una zona inválida rompe `available_slots` para todo el negocio.
create or replace function public.validate_business_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger businesses_validate_timezone before insert or update of timezone
  on public.businesses for each row execute function public.validate_business_timezone();

-- ─────────────────────────────────────────────────────────────
-- 5b. Onboarding endurecido (misma firma que 20261024100000)
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_business_with_owner(
  p_name text,
  p_slug text,
  p_category text default 'barberia',
  p_tagline text default null,
  p_address text default null,
  p_phone text default null,
  p_timezone text default 'America/Santiago',
  p_brand_color text default '#2F3A56'
)
returns table(business_id uuid, slug text, name text, category text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_max_owned constant integer := 3;
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_clean_name text := trim(p_name);
  v_clean_slug text := lower(trim(p_slug));
  v_clean_color text := upper(trim(p_brand_color));
  v_timezone text := coalesce(nullif(trim(p_timezone), ''), 'America/Santiago');
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from auth.users u where u.id = v_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = '42501';
  end if;

  if length(v_clean_name) not between 2 and 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  if v_clean_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$' or v_clean_slug ~ '--' then
    raise exception 'INVALID_SLUG' using errcode = 'P0001';
  end if;

  if v_clean_slug in (
    'admin', 'api', 'app', 'auth', 'aurabook', 'clikium', 'dashboard', 'demo', 'login',
    'onboarding', 'panel', 'registro', 'reserva', 'reservar', 'soporte', 'support', 'www'
  ) then
    raise exception 'SLUG_RESERVED' using errcode = 'P0001';
  end if;

  if p_category not in ('barberia', 'peluqueria', 'unas', 'spa', 'estetica', 'otro') then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = 'P0001';
  end if;

  if v_clean_color is null or v_clean_color !~ '^#[0-9A-F]{6}$' then
    v_clean_color := '#2F3A56';
  end if;

  -- Serializa onboarding concurrente del mismo usuario para que el límite sea exacto.
  perform pg_advisory_xact_lock(hashtextextended('aurabook:onboarding:' || v_user_id::text, 0));

  if (
    select count(*) from public.business_members m
    where m.user_id = v_user_id and m.role = 'owner'
  ) >= c_max_owned then
    raise exception 'BUSINESS_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  begin
    insert into public.businesses (name, slug, category, tagline, address, phone, timezone, brand_color)
    values (
      v_clean_name,
      v_clean_slug,
      p_category,
      nullif(trim(p_tagline), ''),
      nullif(trim(p_address), ''),
      nullif(trim(p_phone), ''),
      v_timezone,
      v_clean_color
    ) returning id into v_business_id;
  exception when unique_violation then
    raise exception 'SLUG_ALREADY_EXISTS' using errcode = 'P0001';
  end;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

  return query
  select b.id, b.slug, b.name, b.category
  from public.businesses b
  where b.id = v_business_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Reserva manual endurecida (misma firma que 20261024100000)
-- ─────────────────────────────────────────────────────────────
-- Decisión: la reserva manual puede quedar fuera del horario laboral (el equipo decide),
-- pero nunca se solapa con otra reserva confirmada (bookings_no_overlap) ni asigna un
-- servicio que el profesional no ofrece.
create or replace function public.panel_create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_client_name text,
  p_client_phone text,
  p_start_at timestamptz,
  p_notes text default null
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
      price_clp, start_at, end_at, source, notes
    ) values (
      p_business_id, p_service_id, p_staff_id, v_clean_name, v_clean_phone,
      v_price, p_start_at, v_end, 'panel', nullif(trim(p_notes), '')
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

-- ─────────────────────────────────────────────────────────────
-- Permisos de funciones
-- ─────────────────────────────────────────────────────────────
revoke all on function public.fill_business_id_from_staff() from public, anon, authenticated;
revoke all on function public.validate_business_timezone() from public, anon, authenticated;

revoke all on function public.has_business_role(uuid, text[]) from public, anon;
grant execute on function public.has_business_role(uuid, text[]) to authenticated, service_role;

-- ════════ 20261026000000_phase2_onboarding.sql ════════
-- AuraBook · Fase 2: onboarding autogestionado
-- Aditiva y no destructiva. Un negocio creado por onboarding nace con is_active = false (no publicado)
-- y solo aparece en /reservar/[slug] cuando `complete_onboarding` verifica que puede recibir reservas.
--
-- Convención: `is_active` = publicado y visible al público. `onboarding_completed_at` = fecha de la
-- primera publicación (informativa).

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas nuevas en businesses
-- ─────────────────────────────────────────────────────────────
alter table public.businesses add column if not exists description text
  check (length(description) <= 600);
alter table public.businesses add column if not exists onboarding_completed_at timestamptz;

-- Negocios ya publicados antes de esta migración se consideran con onboarding completo.
update public.businesses set onboarding_completed_at = created_at
where is_active and onboarding_completed_at is null;

-- ─────────────────────────────────────────────────────────────
-- 2. Slugs
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_reserved_slug(p_slug text)
returns boolean language sql immutable set search_path = '' as $$
  select p_slug = any (array[
    'admin', 'api', 'app', 'auth', 'aurabook', 'clikium', 'cuenta', 'dashboard', 'demo', 'login',
    'onboarding', 'panel', 'recuperar', 'registro', 'reserva', 'reservar', 'soporte', 'support', 'www'
  ]);
$$;

/** Para feedback inmediato en el formulario; la unicidad real la garantiza la restricción UNIQUE. */
create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(p_slug) ~ '^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$'
    and lower(p_slug) !~ '--'
    and not public.is_reserved_slug(lower(p_slug))
    and not exists (select 1 from public.businesses b where b.slug = lower(p_slug));
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Crear negocio (misma firma): ahora nace sin publicar
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_business_with_owner(
  p_name text,
  p_slug text,
  p_category text default 'barberia',
  p_tagline text default null,
  p_address text default null,
  p_phone text default null,
  p_timezone text default 'America/Santiago',
  p_brand_color text default '#2F3A56'
)
returns table(business_id uuid, slug text, name text, category text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_max_owned constant integer := 3;
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_clean_name text := trim(p_name);
  v_clean_slug text := lower(trim(p_slug));
  v_clean_color text := upper(trim(p_brand_color));
  v_timezone text := coalesce(nullif(trim(p_timezone), ''), 'America/Santiago');
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from auth.users u where u.id = v_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = '42501';
  end if;

  if v_clean_name is null or length(v_clean_name) not between 2 and 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  if v_clean_slug is null or v_clean_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$' or v_clean_slug ~ '--' then
    raise exception 'INVALID_SLUG' using errcode = 'P0001';
  end if;

  if public.is_reserved_slug(v_clean_slug) then
    raise exception 'SLUG_RESERVED' using errcode = 'P0001';
  end if;

  if p_category is null or p_category not in ('barberia', 'peluqueria', 'unas', 'spa', 'estetica', 'otro') then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = 'P0001';
  end if;

  if v_clean_color is null or v_clean_color !~ '^#[0-9A-F]{6}$' then
    v_clean_color := '#2F3A56';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('aurabook:onboarding:' || v_user_id::text, 0));

  if (
    select count(*) from public.business_members m
    where m.user_id = v_user_id and m.role = 'owner'
  ) >= c_max_owned then
    raise exception 'BUSINESS_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  begin
    insert into public.businesses (
      name, slug, category, tagline, address, phone, timezone, brand_color, is_active
    ) values (
      v_clean_name,
      v_clean_slug,
      p_category,
      nullif(trim(p_tagline), ''),
      nullif(trim(p_address), ''),
      nullif(trim(p_phone), ''),
      v_timezone,
      v_clean_color,
      false
    ) returning id into v_business_id;
  exception when unique_violation then
    raise exception 'SLUG_ALREADY_EXISTS' using errcode = 'P0001';
  end;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

  return query
  select b.id, b.slug, b.name, b.category
  from public.businesses b
  where b.id = v_business_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Perfil del negocio (solo owner). El slug no se cambia aquí: rompería enlaces compartidos.
-- ─────────────────────────────────────────────────────────────
create or replace function public.update_business_profile(
  p_business_id uuid,
  p_name text,
  p_category text,
  p_tagline text,
  p_description text,
  p_address text,
  p_phone text
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_clean_name text := trim(p_name);
begin
  if not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_clean_name is null or length(v_clean_name) not between 2 and 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if p_category is null or p_category not in ('barberia', 'peluqueria', 'unas', 'spa', 'estetica', 'otro') then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if length(trim(p_tagline)) > 160 or length(trim(p_description)) > 600
    or length(trim(p_address)) > 200 or length(trim(p_phone)) > 20
  then
    raise exception 'INVALID_PROFILE' using errcode = 'P0001';
  end if;

  update public.businesses set
    name = v_clean_name,
    category = p_category,
    tagline = nullif(trim(p_tagline), ''),
    description = nullif(trim(p_description), ''),
    address = nullif(trim(p_address), ''),
    phone = nullif(trim(p_phone), '')
  where id = p_business_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Profesionales (owner/admin)
-- ─────────────────────────────────────────────────────────────
create or replace function public.save_staff(
  p_business_id uuid,
  p_staff_id uuid,
  p_name text,
  p_role_title text default null,
  p_link_to_me boolean default false
)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  c_max_staff constant integer := 50;
  v_id uuid;
  v_clean_name text := trim(p_name);
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_clean_name is null or length(v_clean_name) not between 2 and 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if length(trim(p_role_title)) > 60 then
    raise exception 'INVALID_ROLE_TITLE' using errcode = 'P0001';
  end if;

  if p_staff_id is null then
    if (select count(*) from public.staff s where s.business_id = p_business_id and s.is_active) >= c_max_staff then
      raise exception 'STAFF_LIMIT_REACHED' using errcode = 'P0001';
    end if;
    insert into public.staff (business_id, name, role_title, sort_order)
    values (
      p_business_id, v_clean_name, nullif(trim(p_role_title), ''),
      coalesce((select max(s.sort_order) + 1 from public.staff s where s.business_id = p_business_id), 0)
    ) returning id into v_id;
  else
    update public.staff s set name = v_clean_name, role_title = nullif(trim(p_role_title), ''), is_active = true
    where s.id = p_staff_id and s.business_id = p_business_id
    returning s.id into v_id;
    if v_id is null then
      raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  -- "Yo también atiendo": vincula la membresía del usuario actual a este perfil.
  if p_link_to_me then
    if exists (
      select 1 from public.business_members m
      where m.business_id = p_business_id and m.staff_id = v_id and m.user_id <> auth.uid()
    ) then
      raise exception 'STAFF_ALREADY_LINKED' using errcode = 'P0001';
    end if;
    update public.business_members m set staff_id = v_id
    where m.business_id = p_business_id and m.user_id = auth.uid();
  end if;

  return v_id;
end;
$$;

-- Archivar (no borrar): las reservas históricas siguen apuntando al profesional.
create or replace function public.archive_staff(p_business_id uuid, p_staff_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.bookings bk
    where bk.business_id = p_business_id and bk.staff_id = p_staff_id
      and bk.status = 'confirmed' and bk.start_at > now()
  ) then
    raise exception 'STAFF_HAS_UPCOMING_BOOKINGS' using errcode = 'P0001';
  end if;
  update public.staff s set is_active = false
  where s.id = p_staff_id and s.business_id = p_business_id;
  if not found then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Servicios (owner/admin) con sus profesionales habilitados
-- ─────────────────────────────────────────────────────────────
create or replace function public.save_service(
  p_business_id uuid,
  p_service_id uuid,
  p_name text,
  p_description text,
  p_price_clp integer,
  p_duration_min integer,
  p_staff_ids uuid[]
)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  c_max_services constant integer := 100;
  v_id uuid;
  v_clean_name text := trim(p_name);
  v_staff_ids uuid[] := coalesce(p_staff_ids, array[]::uuid[]);
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_clean_name is null or length(v_clean_name) not between 2 and 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if length(trim(p_description)) > 300 then
    raise exception 'INVALID_DESCRIPTION' using errcode = 'P0001';
  end if;
  if p_price_clp is null or p_price_clp not between 0 and 10000000 then
    raise exception 'INVALID_PRICE' using errcode = 'P0001';
  end if;
  if p_duration_min is null or p_duration_min not between 15 and 480 or p_duration_min % 15 <> 0 then
    raise exception 'INVALID_DURATION' using errcode = 'P0001';
  end if;
  if cardinality(v_staff_ids) = 0 then
    raise exception 'NEEDS_STAFF' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.staff s
    where s.business_id = p_business_id and s.is_active and s.id = any(v_staff_ids)
  ) <> (select count(distinct x) from unnest(v_staff_ids) x) then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_service_id is null then
    if (select count(*) from public.services s where s.business_id = p_business_id and s.is_active) >= c_max_services then
      raise exception 'SERVICE_LIMIT_REACHED' using errcode = 'P0001';
    end if;
    insert into public.services (business_id, name, description, price_clp, duration_min, sort_order)
    values (
      p_business_id, v_clean_name, nullif(trim(p_description), ''), p_price_clp, p_duration_min,
      coalesce((select max(s.sort_order) + 1 from public.services s where s.business_id = p_business_id), 0)
    ) returning id into v_id;
  else
    update public.services s set
      name = v_clean_name,
      description = nullif(trim(p_description), ''),
      price_clp = p_price_clp,
      duration_min = p_duration_min,
      is_active = true
    where s.id = p_service_id and s.business_id = p_business_id
    returning s.id into v_id;
    if v_id is null then
      raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  delete from public.staff_services ss
  where ss.business_id = p_business_id and ss.service_id = v_id and not (ss.staff_id = any(v_staff_ids));
  insert into public.staff_services (business_id, staff_id, service_id)
  select p_business_id, x, v_id from unnest(v_staff_ids) x
  on conflict do nothing;

  return v_id;
end;
$$;

create or replace function public.archive_service(p_business_id uuid, p_service_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.services s set is_active = false
  where s.id = p_service_id and s.business_id = p_business_id;
  if not found then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. Horario semanal (owner/admin): reemplaza horario y descanso de uno o varios profesionales
-- ─────────────────────────────────────────────────────────────
-- p_days: [{"weekday": 1, "opens": "10:00", "closes": "19:00", "break_start": "14:00", "break_end": "15:00"}]
-- weekday sigue a PostgreSQL (domingo = 0). Un día ausente = no trabaja. El descanso es opcional.
create or replace function public.set_weekly_schedule(
  p_business_id uuid,
  p_staff_ids uuid[],
  p_days jsonb
)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  c_time constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_staff_ids uuid[] := coalesce(p_staff_ids, array[]::uuid[]);
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if cardinality(v_staff_ids) = 0 then
    raise exception 'NEEDS_STAFF' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.staff s where s.business_id = p_business_id and s.id = any(v_staff_ids)
  ) <> (select count(distinct x) from unnest(v_staff_ids) x) then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 7 then
    raise exception 'INVALID_SCHEDULE' using errcode = 'P0001';
  end if;

  -- 1) Forma: cada elemento es un objeto con horas HH:MM; el descanso va completo o no va.
  if exists (
    select 1 from jsonb_array_elements(p_days) e
    where jsonb_typeof(e) <> 'object'
      or coalesce(e->>'weekday', '') !~ '^[0-6]$'
      or coalesce(e->>'opens', '') !~ c_time
      or coalesce(e->>'closes', '') !~ c_time
      or (nullif(e->>'break_start', '') is null) <> (nullif(e->>'break_end', '') is null)
      or coalesce(nullif(e->>'break_start', ''), '00:00') !~ c_time
      or coalesce(nullif(e->>'break_end', ''), '00:00') !~ c_time
  ) then
    raise exception 'INVALID_SCHEDULE' using errcode = 'P0001';
  end if;

  -- 2) Coherencia: apertura < cierre, descanso dentro de la jornada, sin días repetidos.
  if exists (
    select 1 from (
      select
        (e->>'opens')::time as opens,
        (e->>'closes')::time as closes,
        nullif(e->>'break_start', '')::time as break_start,
        nullif(e->>'break_end', '')::time as break_end
      from jsonb_array_elements(p_days) e
    ) d
    where d.opens >= d.closes
      or (d.break_start is not null
          and (d.break_start >= d.break_end or d.break_start < d.opens or d.break_end > d.closes))
  ) or (
    select count(distinct e->>'weekday') from jsonb_array_elements(p_days) e
  ) <> jsonb_array_length(p_days) then
    raise exception 'INVALID_SCHEDULE' using errcode = 'P0001';
  end if;

  delete from public.staff_breaks b where b.business_id = p_business_id and b.staff_id = any(v_staff_ids);
  delete from public.working_hours w where w.business_id = p_business_id and w.staff_id = any(v_staff_ids);

  insert into public.working_hours (business_id, staff_id, weekday, opens_at, closes_at)
  select p_business_id, s, (e->>'weekday')::smallint, (e->>'opens')::time, (e->>'closes')::time
  from unnest(v_staff_ids) s cross join jsonb_array_elements(p_days) e;

  insert into public.staff_breaks (business_id, staff_id, weekday, starts_at, ends_at)
  select p_business_id, s, (e->>'weekday')::smallint, (e->>'break_start')::time, (e->>'break_end')::time
  from unnest(v_staff_ids) s cross join jsonb_array_elements(p_days) e
  where nullif(e->>'break_start', '') is not null;

  return jsonb_array_length(p_days);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. Publicar (solo owner): verifica que el negocio puede recibir reservas
-- ─────────────────────────────────────────────────────────────
create or replace function public.complete_onboarding(p_business_id uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_slug text;
begin
  if not public.has_business_role(p_business_id, array['owner']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (select 1 from public.staff s where s.business_id = p_business_id and s.is_active) then
    raise exception 'NEEDS_STAFF' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.services v where v.business_id = p_business_id and v.is_active) then
    raise exception 'NEEDS_SERVICE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.services v
    where v.business_id = p_business_id and v.is_active
      and not exists (
        select 1 from public.staff_services ss
        join public.staff s on s.id = ss.staff_id and s.is_active
        where ss.service_id = v.id
      )
  ) then
    raise exception 'SERVICE_WITHOUT_STAFF' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.working_hours w
    join public.staff s on s.id = w.staff_id and s.is_active
    where w.business_id = p_business_id
  ) then
    raise exception 'NEEDS_HOURS' using errcode = 'P0001';
  end if;

  update public.businesses b set
    is_active = true,
    onboarding_completed_at = coalesce(b.onboarding_completed_at, now())
  where b.id = p_business_id
  returning b.slug into v_slug;

  return v_slug;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function public.is_reserved_slug(text) from public, anon, authenticated;

revoke all on function public.slug_available(text) from public, anon;
grant execute on function public.slug_available(text) to authenticated;

revoke all on function
  public.update_business_profile(uuid, text, text, text, text, text, text),
  public.save_staff(uuid, uuid, text, text, boolean),
  public.archive_staff(uuid, uuid),
  public.save_service(uuid, uuid, text, text, integer, integer, uuid[]),
  public.archive_service(uuid, uuid),
  public.set_weekly_schedule(uuid, uuid[], jsonb),
  public.complete_onboarding(uuid)
from public, anon;

grant execute on function
  public.update_business_profile(uuid, text, text, text, text, text, text),
  public.save_staff(uuid, uuid, text, text, boolean),
  public.archive_staff(uuid, uuid),
  public.save_service(uuid, uuid, text, text, integer, integer, uuid[]),
  public.archive_service(uuid, uuid),
  public.set_weekly_schedule(uuid, uuid[], jsonb),
  public.complete_onboarding(uuid)
to authenticated;

-- ════════ 20261027000000_platform_billing.sql ════════
-- AuraBook · Planes, suscripciones y panel de plataforma (administración Clikium)
-- Aditiva y no destructiva. Sin pasarela de pago: los pagos se registran manualmente desde /admin.
--
-- Estado de una suscripción: se CALCULA a partir de fechas (no hay cron ni columna que se desactualice).
--   cancelled  → cancelled_at no nulo
--   active     → paid_until > now()
--   trial      → sin pagos y trial_ends_at > now()
--   past_due   → todo lo demás (prueba vencida o periodo pagado vencido)
-- Al vencer NO se bloquean reservas (decisión de pilotos); el dueño ve un aviso y la plataforma lo ve como vencido.

-- ─────────────────────────────────────────────────────────────
-- 1. Administradores de plataforma (solo se agregan por SQL, nunca desde la app)
-- ─────────────────────────────────────────────────────────────
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Planes, ajustes, suscripciones y pagos
-- ─────────────────────────────────────────────────────────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 60),
  description text check (length(description) <= 300),
  price_clp integer not null check (price_clp between 0 and 10000000),
  -- null = sin límite. Informativo en pilotos: no se bloquea al superarlo.
  max_staff integer check (max_staff between 1 and 500),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  id boolean primary key default true check (id),
  trial_days integer not null default 14 check (trial_days between 0 and 365),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict do nothing;

create table public.subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan_id uuid references public.plans(id),
  trial_ends_at timestamptz not null,
  paid_until timestamptz,
  cancelled_at timestamptz,
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_plan_idx on public.subscriptions(plan_id);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid references public.plans(id),
  amount_clp integer not null check (amount_clp between 0 and 100000000),
  paid_at date not null,
  months integer not null check (months between 1 and 24),
  period_start timestamptz not null,
  period_end timestamptz not null,
  method text not null check (method in ('transferencia', 'efectivo', 'tarjeta', 'otro')),
  reference text check (length(reference) <= 120),
  notes text check (length(notes) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_start < period_end)
);
create index subscription_payments_business_idx on public.subscription_payments(business_id, paid_at desc);
create index subscription_payments_paid_idx on public.subscription_payments(paid_at);

create or replace function public.subscription_status(
  p_trial_ends_at timestamptz, p_paid_until timestamptz, p_cancelled_at timestamptz
)
returns text language sql stable set search_path = '' as $$
  select case
    when p_cancelled_at is not null then 'cancelled'
    when p_paid_until is not null and p_paid_until > now() then 'active'
    when p_paid_until is null and p_trial_ends_at > now() then 'trial'
    else 'past_due'
  end;
$$;

-- Todo negocio nuevo nace con su prueba gratis.
create or replace function public.create_trial_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (business_id, trial_ends_at)
  select new.id, now() + make_interval(days => s.trial_days)
  from public.platform_settings s
  on conflict (business_id) do nothing;
  return new;
end;
$$;

create trigger businesses_create_subscription after insert on public.businesses
  for each row execute function public.create_trial_subscription();

-- Negocios existentes: prueba desde hoy.
insert into public.subscriptions (business_id, trial_ends_at)
select b.id, now() + make_interval(days => s.trial_days)
from public.businesses b cross join public.platform_settings s
on conflict (business_id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 3. RLS: sin acceso directo. Todo pasa por las RPC de abajo.
-- ─────────────────────────────────────────────────────────────
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.platform_settings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;

revoke all on table public.platform_admins, public.plans, public.platform_settings,
  public.subscriptions, public.subscription_payments from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Vista del dueño: su suscripción (owner/admin del negocio)
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_business_subscription(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'status', public.subscription_status(s.trial_ends_at, s.paid_until, s.cancelled_at),
    'trialEndsAt', s.trial_ends_at,
    'paidUntil', s.paid_until,
    'plan', case when p.id is null then null else jsonb_build_object(
      'id', p.id, 'name', p.name, 'description', coalesce(p.description, ''),
      'priceClp', p.price_clp, 'maxStaff', p.max_staff
    ) end,
    'staffCount', (select count(*) from public.staff st where st.business_id = s.business_id and st.is_active),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'paidAt', sp.paid_at, 'amountClp', sp.amount_clp, 'months', sp.months,
        'periodEnd', sp.period_end, 'method', sp.method, 'planName', pp.name
      ) order by sp.paid_at desc, sp.created_at desc)
      from public.subscription_payments sp
      left join public.plans pp on pp.id = sp.plan_id
      where sp.business_id = s.business_id
    ), '[]'::jsonb),
    'availablePlans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ap.id, 'name', ap.name, 'description', coalesce(ap.description, ''),
        'priceClp', ap.price_clp, 'maxStaff', ap.max_staff
      ) order by ap.sort_order, ap.price_clp)
      from public.plans ap where ap.is_active
    ), '[]'::jsonb)
  ) into v_result
  from public.subscriptions s
  left join public.plans p on p.id = s.plan_id
  where s.business_id = p_business_id;

  return v_result;
end;
$$;

-- Estado resumido de los negocios del usuario (para avisos en el panel).
create or replace function public.my_subscriptions()
returns table(business_id uuid, status text, trial_ends_at timestamptz, paid_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.business_id, public.subscription_status(s.trial_ends_at, s.paid_until, s.cancelled_at),
    s.trial_ends_at, s.paid_until
  from public.subscriptions s
  join public.business_members m on m.business_id = s.business_id
  where m.user_id = auth.uid() and m.role in ('owner', 'admin');
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Panel de plataforma (solo platform_admins)
-- ─────────────────────────────────────────────────────────────
create or replace function public.assert_platform_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

-- Todo lo que muestra /admin en una sola llamada. Pensado para la escala de pilotos (decenas de negocios).
create or replace function public.admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz constant text := 'America/Santiago';
  v_month_start date := date_trunc('month', now() at time zone v_tz)::date;
  v_result jsonb;
begin
  perform public.assert_platform_admin();

  with biz as (
    select
      b.id, b.name, b.slug, b.category, b.is_active as published, b.created_at, b.phone,
      s.plan_id, p.name as plan_name, p.price_clp as plan_price, p.max_staff,
      public.subscription_status(s.trial_ends_at, s.paid_until, s.cancelled_at) as status,
      s.trial_ends_at, s.paid_until, s.notes,
      (select u.email from public.business_members m join auth.users u on u.id = m.user_id
        where m.business_id = b.id and m.role = 'owner' order by m.created_at limit 1) as owner_email,
      (select count(*) from public.staff st where st.business_id = b.id and st.is_active) as staff_count,
      (select count(*) from public.bookings bk where bk.business_id = b.id
        and bk.created_at > now() - interval '30 days') as bookings_30d,
      (select max(sp.paid_at) from public.subscription_payments sp where sp.business_id = b.id) as last_paid_at
    from public.businesses b
    join public.subscriptions s on s.business_id = b.id
    left join public.plans p on p.id = s.plan_id
  )
  select jsonb_build_object(
    'overview', jsonb_build_object(
      'mrrClp', coalesce((select sum(r.plan_price) from biz r where r.status = 'active'), 0),
      'collectedThisMonthClp', coalesce((select sum(sp.amount_clp) from public.subscription_payments sp
        where sp.paid_at >= v_month_start), 0),
      'collectedLastMonthClp', coalesce((select sum(sp.amount_clp) from public.subscription_payments sp
        where sp.paid_at >= (v_month_start - interval '1 month')::date and sp.paid_at < v_month_start), 0),
      'businessesTotal', (select count(*) from biz),
      'businessesPublished', (select count(*) from biz r where r.published),
      'newThisMonth', (select count(*) from biz r where (r.created_at at time zone v_tz)::date >= v_month_start),
      'bookings30d', (select coalesce(sum(r.bookings_30d), 0) from biz r),
      'byStatus', jsonb_build_object(
        'trial', (select count(*) from biz r where r.status = 'trial'),
        'active', (select count(*) from biz r where r.status = 'active'),
        'past_due', (select count(*) from biz r where r.status = 'past_due'),
        'cancelled', (select count(*) from biz r where r.status = 'cancelled')
      ),
      'revenueByMonth', (
        select jsonb_agg(jsonb_build_object(
          'month', to_char(m, 'YYYY-MM'),
          'amountClp', coalesce((select sum(sp.amount_clp) from public.subscription_payments sp
            where sp.paid_at >= m::date and sp.paid_at < (m + interval '1 month')::date), 0)
        ) order by m)
        from generate_series(v_month_start - interval '5 months', v_month_start, interval '1 month') m
      )
    ),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'slug', r.slug, 'category', r.category, 'published', r.published,
      'createdAt', r.created_at, 'phone', coalesce(r.phone, ''), 'ownerEmail', coalesce(r.owner_email, ''),
      'planId', r.plan_id, 'planName', r.plan_name, 'planPriceClp', r.plan_price, 'maxStaff', r.max_staff,
      'status', r.status, 'trialEndsAt', r.trial_ends_at, 'paidUntil', r.paid_until, 'notes', coalesce(r.notes, ''),
      'staffCount', r.staff_count, 'bookings30d', r.bookings_30d, 'lastPaidAt', r.last_paid_at
    ) order by r.created_at desc) from biz r), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'description', coalesce(p.description, ''), 'priceClp', p.price_clp,
      'maxStaff', p.max_staff, 'isActive', p.is_active,
      'subscribers', (select count(*) from biz r where r.plan_id = p.id and r.status in ('active', 'trial'))
    ) order by p.sort_order, p.price_clp) from public.plans p), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(x.j order by x.paid_at desc, x.created_at desc) from (
      select sp.paid_at, sp.created_at, jsonb_build_object(
        'id', sp.id, 'businessId', sp.business_id, 'businessName', b.name, 'planName', p.name,
        'amountClp', sp.amount_clp, 'paidAt', sp.paid_at, 'months', sp.months,
        'periodStart', sp.period_start, 'periodEnd', sp.period_end, 'method', sp.method,
        'reference', coalesce(sp.reference, '')
      ) as j
      from public.subscription_payments sp
      join public.businesses b on b.id = sp.business_id
      left join public.plans p on p.id = sp.plan_id
      order by sp.paid_at desc, sp.created_at desc
      limit 100
    ) x), '[]'::jsonb),
    'settings', (select jsonb_build_object('trialDays', s.trial_days) from public.platform_settings s)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_save_plan(
  p_plan_id uuid, p_name text, p_description text, p_price_clp integer, p_max_staff integer, p_is_active boolean
)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_name text := trim(p_name);
begin
  perform public.assert_platform_admin();
  if v_name is null or length(v_name) not between 2 and 60 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if p_price_clp is null or p_price_clp not between 0 and 10000000 then
    raise exception 'INVALID_PRICE' using errcode = 'P0001';
  end if;
  if p_max_staff is not null and p_max_staff not between 1 and 500 then
    raise exception 'INVALID_MAX_STAFF' using errcode = 'P0001';
  end if;

  if p_plan_id is null then
    insert into public.plans (name, description, price_clp, max_staff, is_active, sort_order)
    values (v_name, nullif(trim(p_description), ''), p_price_clp, p_max_staff, coalesce(p_is_active, true),
      coalesce((select max(p.sort_order) + 1 from public.plans p), 0))
    returning id into v_id;
  else
    update public.plans p set name = v_name, description = nullif(trim(p_description), ''),
      price_clp = p_price_clp, max_staff = p_max_staff, is_active = coalesce(p_is_active, p.is_active)
    where p.id = p_plan_id returning p.id into v_id;
    if v_id is null then
      raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_set_business_plan(p_business_id uuid, p_plan_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  if p_plan_id is not null and not exists (select 1 from public.plans p where p.id = p_plan_id) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.subscriptions s set plan_id = p_plan_id where s.business_id = p_business_id;
  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- Registra un pago y extiende el periodo pagado. Si se paga durante la prueba, el periodo pagado
-- empieza al terminar la prueba; si se paga con el plan vigente, se suma al final del periodo.
create or replace function public.admin_record_payment(
  p_business_id uuid,
  p_plan_id uuid,
  p_amount_clp integer,
  p_months integer,
  p_paid_at date,
  p_method text,
  p_reference text default null,
  p_notes text default null
)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_sub public.subscriptions%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
begin
  perform public.assert_platform_admin();
  if p_amount_clp is null or p_amount_clp not between 0 and 100000000 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if p_months is null or p_months not between 1 and 24 then
    raise exception 'INVALID_MONTHS' using errcode = 'P0001';
  end if;
  if p_paid_at is null or p_paid_at > (now() at time zone 'America/Santiago')::date + 1 then
    raise exception 'INVALID_PAID_AT' using errcode = 'P0001';
  end if;
  if p_method is null or p_method not in ('transferencia', 'efectivo', 'tarjeta', 'otro') then
    raise exception 'INVALID_METHOD' using errcode = 'P0001';
  end if;
  if p_plan_id is null or not exists (select 1 from public.plans p where p.id = p_plan_id) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_sub from public.subscriptions s where s.business_id = p_business_id for update;
  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_start := greatest(coalesce(v_sub.paid_until, '-infinity'::timestamptz), v_sub.trial_ends_at, now());
  v_end := v_start + make_interval(months => p_months);

  insert into public.subscription_payments (
    business_id, plan_id, amount_clp, paid_at, months, period_start, period_end, method, reference, notes, created_by
  ) values (
    p_business_id, p_plan_id, p_amount_clp, p_paid_at, p_months, v_start, v_end, p_method,
    nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), auth.uid()
  ) returning id into v_id;

  update public.subscriptions s set plan_id = p_plan_id, paid_until = v_end, cancelled_at = null
  where s.business_id = p_business_id;

  return v_id;
end;
$$;

create or replace function public.admin_extend_trial(p_business_id uuid, p_days integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'INVALID_DAYS' using errcode = 'P0001';
  end if;
  update public.subscriptions s
    set trial_ends_at = greatest(s.trial_ends_at, now()) + make_interval(days => p_days)
  where s.business_id = p_business_id;
  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_set_cancelled(p_business_id uuid, p_cancelled boolean, p_notes text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  update public.subscriptions s set
    cancelled_at = case when p_cancelled then coalesce(s.cancelled_at, now()) else null end,
    notes = coalesce(nullif(trim(p_notes), ''), s.notes)
  where s.business_id = p_business_id;
  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_update_settings(p_trial_days integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  if p_trial_days is null or p_trial_days not between 0 and 365 then
    raise exception 'INVALID_DAYS' using errcode = 'P0001';
  end if;
  update public.platform_settings set trial_days = p_trial_days, updated_at = now() where id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function public.subscription_status(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.create_trial_subscription() from public, anon, authenticated;
revoke all on function public.assert_platform_admin() from public, anon, authenticated;

revoke all on function
  public.is_platform_admin(),
  public.get_business_subscription(uuid),
  public.my_subscriptions(),
  public.admin_snapshot(),
  public.admin_save_plan(uuid, text, text, integer, integer, boolean),
  public.admin_set_business_plan(uuid, uuid),
  public.admin_record_payment(uuid, uuid, integer, integer, date, text, text, text),
  public.admin_extend_trial(uuid, integer),
  public.admin_set_cancelled(uuid, boolean, text),
  public.admin_update_settings(integer)
from public, anon;

grant execute on function
  public.is_platform_admin(),
  public.get_business_subscription(uuid),
  public.my_subscriptions(),
  public.admin_snapshot(),
  public.admin_save_plan(uuid, text, text, integer, integer, boolean),
  public.admin_set_business_plan(uuid, uuid),
  public.admin_record_payment(uuid, uuid, integer, integer, date, text, text, text),
  public.admin_extend_trial(uuid, integer),
  public.admin_set_cancelled(uuid, boolean, text),
  public.admin_update_settings(integer)
to authenticated;

comment on table public.platform_admins is 'Administradores de AuraBook (Clikium). Agregar solo por SQL.';

-- ════════ 20261028000000_business_branding.sql ════════
-- AuraBook · Marca del negocio: logotipo y color
-- Aditiva y no destructiva.
--
-- Logos: bucket público `business-logos` en Supabase Storage, una carpeta por negocio (<business_id>/…).
-- No hay políticas de escritura para anon/authenticated: el servidor sube el archivo con la clave
-- secreta después de verificar el rol, y guarda la URL con `set_business_logo`, que vuelve a verificarlo.

-- ─────────────────────────────────────────────────────────────
-- 1. Bucket (solo si existe Supabase Storage; en las pruebas con PGlite no existe)
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage')
    and exists (select 1 from pg_catalog.pg_tables where schemaname = 'storage' and tablename = 'buckets')
  then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('business-logos', 'business-logos', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Logo (owner/admin). La URL debe apuntar a la carpeta del propio negocio en el bucket.
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_business_logo(p_business_id uuid, p_logo_url text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_logo_url is not null and (
    length(p_logo_url) > 500
    or p_logo_url !~ ('^https://[a-z0-9.-]+/storage/v1/object/public/business-logos/'
                      || p_business_id::text || '/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$')
  ) then
    raise exception 'INVALID_LOGO' using errcode = 'P0001';
  end if;
  update public.businesses set logo_url = p_logo_url where id = p_business_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Color de marca (owner/admin)
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_business_brand_color(p_business_id uuid, p_brand_color text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_brand_color is null or p_brand_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'INVALID_COLOR' using errcode = 'P0001';
  end if;
  update public.businesses set brand_color = upper(p_brand_color) where id = p_business_id;
end;
$$;

revoke all on function
  public.set_business_logo(uuid, text),
  public.set_business_brand_color(uuid, text)
from public, anon;

grant execute on function
  public.set_business_logo(uuid, text),
  public.set_business_brand_color(uuid, text)
to authenticated;

-- ════════ 20261029000000_booking_notifications.sql ════════
-- AuraBook · Notificaciones de reservas
-- Aditiva y no destructiva.
--
-- 1. Correo opcional del cliente y su elección de recibir un recordatorio el día antes.
-- 2. Datos para el aviso al dueño y para la confirmación al cliente (solo servidor).
-- 3. Recordatorios del día siguiente, enviados una vez por una tarea diaria (solo servidor).
--
-- El correo se agrega con una función aparte y no cambiando la firma de create_public_booking,
-- para que el código ya desplegado siga funcionando mientras se publica la nueva versión.

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas
-- ─────────────────────────────────────────────────────────────
alter table public.bookings add column if not exists client_email text
  check (client_email is null or (length(client_email) <= 254 and client_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
alter table public.bookings add column if not exists reminder_opt_in boolean not null default false;
alter table public.bookings add column if not exists reminder_sent_at timestamptz;

-- El equipo ve el correo y la preferencia (el grant de bookings es por columnas, ver 20261025000000).
grant select (client_email, reminder_opt_in, reminder_sent_at) on table public.bookings to authenticated;

create index if not exists bookings_reminder_due_idx on public.bookings(start_at)
  where status = 'confirmed' and reminder_opt_in and reminder_sent_at is null;

-- ─────────────────────────────────────────────────────────────
-- 2. Contacto del cliente (solo service_role, justo después de crear la reserva pública)
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_public_booking_contact(p_booking_id uuid, p_email text, p_reminder boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
begin
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  update public.bookings set
    client_email = v_email,
    reminder_opt_in = coalesce(p_reminder, false) and v_email is not null
  where id = p_booking_id and source = 'web' and created_at > now() - interval '10 minutes';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Todo lo necesario para los correos de una reserva (solo service_role)
-- ─────────────────────────────────────────────────────────────
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
-- 4. Recordatorios: citas confirmadas de MAÑANA (día calendario en la zona del negocio)
-- ─────────────────────────────────────────────────────────────
create or replace function public.due_reminders()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select b.id
  from public.bookings b
  join public.businesses shop on shop.id = b.business_id
  where b.status = 'confirmed'
    and b.reminder_opt_in
    and b.reminder_sent_at is null
    and b.client_email is not null
    and b.start_at > now()
    and b.start_at < now() + interval '3 days'
    and (b.start_at at time zone shop.timezone)::date = (now() at time zone shop.timezone)::date + 1
  order by b.start_at
  limit 500;
$$;

-- Marca el envío de forma atómica: devuelve false si otro proceso ya lo marcó (evita duplicados).
create or replace function public.claim_reminder(p_booking_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.bookings set reminder_sent_at = now()
  where id = p_booking_id and reminder_sent_at is null and status = 'confirmed' and reminder_opt_in;
  return found;
end;
$$;

-- Si el envío falla, se libera para reintentar en la siguiente ejecución.
create or replace function public.release_reminder(p_booking_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.bookings set reminder_sent_at = null where id = p_booking_id;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos: solo el servidor (service_role)
-- ─────────────────────────────────────────────────────────────
revoke all on function
  public.set_public_booking_contact(uuid, text, boolean),
  public.booking_notification(uuid),
  public.due_reminders(),
  public.claim_reminder(uuid),
  public.release_reminder(uuid)
from public, anon, authenticated;

grant execute on function
  public.set_public_booking_contact(uuid, text, boolean),
  public.booking_notification(uuid),
  public.due_reminders(),
  public.claim_reminder(uuid),
  public.release_reminder(uuid)
to service_role;

commit;

select 'AuraBook instalado' as resultado;
