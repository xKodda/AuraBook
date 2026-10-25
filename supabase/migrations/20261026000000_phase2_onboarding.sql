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
