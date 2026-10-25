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
