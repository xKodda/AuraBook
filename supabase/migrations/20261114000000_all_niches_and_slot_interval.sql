-- AuraBook · Todo tipo de negocio con hora agendada + intervalo de horas por negocio
-- Aditiva y re-ejecutable. Aplicar en Supabase > SQL Editor después de 20261113000000_push_subscriptions.sql.
-- 1) Nuevos rubros: automotriz, salud, veterinaria, profesional, deporte, clases, tatuajes, fotografia.
-- 2) businesses.slot_interval_min: cada cuánto se ofrecen las horas (15, 30 o 60 min; por defecto horas enteras).


-- ─────────────────────────────────────────────────────────────
-- 1. Rubros
-- ─────────────────────────────────────────────────────────────
alter table public.businesses drop constraint if exists businesses_category_check;
alter table public.businesses add constraint businesses_category_check
  check (category in ('barberia', 'peluqueria', 'unas', 'spa', 'estetica', 'automotriz', 'salud', 'veterinaria', 'profesional', 'deporte', 'clases', 'tatuajes', 'fotografia', 'otro'));

-- Mismas funciones de 20261026000000_phase2_onboarding.sql; solo cambia la lista de rubros.
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

  if p_category is null or p_category not in ('barberia', 'peluqueria', 'unas', 'spa', 'estetica', 'automotriz', 'salud', 'veterinaria', 'profesional', 'deporte', 'clases', 'tatuajes', 'fotografia', 'otro') then
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
  if p_category is null or p_category not in ('barberia', 'peluqueria', 'unas', 'spa', 'estetica', 'automotriz', 'salud', 'veterinaria', 'profesional', 'deporte', 'clases', 'tatuajes', 'fotografia', 'otro') then
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
-- 2. Intervalo de horas
-- ─────────────────────────────────────────────────────────────
alter table public.businesses add column if not exists slot_interval_min integer not null default 60;
alter table public.businesses drop constraint if exists businesses_slot_interval_min_check;
alter table public.businesses add constraint businesses_slot_interval_min_check check (slot_interval_min in (15, 30, 60));

create or replace function public.update_slot_interval(p_business_id uuid, p_minutes integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_minutes is null or p_minutes not in (15, 30, 60) then
    raise exception 'INVALID_RULES' using errcode = 'P0001';
  end if;
  update public.businesses set slot_interval_min = p_minutes where id = p_business_id;
end;
$$;

revoke all on function public.update_slot_interval(uuid, integer) from public, anon;
grant execute on function public.update_slot_interval(uuid, integer) to authenticated;

-- Misma función de 20261108000000_plans_v3.sql; las horas se generan cada slot_interval_min desde la apertura.
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
    select c.*, g.start_at, g.start_at + make_interval(mins => c.duration_min) as end_at
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

revoke all on function public.available_slots(text, uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.available_slots(text, uuid, date, uuid) to anon, service_role;

