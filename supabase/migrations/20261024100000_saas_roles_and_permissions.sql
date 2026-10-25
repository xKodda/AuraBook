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
