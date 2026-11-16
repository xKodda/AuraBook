-- ═════════════════════════════════════════════════════════════
-- AuraBook · Programa Fundadores
-- ═════════════════════════════════════════════════════════════
-- Los primeros `founders_total` negocios reales reciben un número de fundador al publicar y Premium gratis por
-- `founder_months` meses desde ese día (se alarga la prueba; no se suma a ella). El contador de la web se calcula
-- desde aquí (founders_summary), nunca a mano.
-- No cuentan: negocios marcados como internos (demos, pruebas) ni los que pertenecen a un administrador de la
-- plataforma. Desde /admin se puede quitar o dar un cupo; al quitarlo, el número queda libre para el siguiente.
-- Aditiva: al aplicarla, los negocios ya publicados reciben su número por orden de publicación y sus meses
-- gratis corren desde hoy.

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas
-- ─────────────────────────────────────────────────────────────
alter table public.platform_settings
  add column if not exists founders_total integer not null default 15 check (founders_total between 0 and 1000),
  add column if not exists founder_months integer not null default 6 check (founder_months between 1 and 24);

alter table public.businesses
  add column if not exists is_internal boolean not null default false,
  add column if not exists founder_number integer check (founder_number between 1 and 1000),
  add column if not exists founder_since timestamptz,
  add column if not exists founder_until timestamptz,
  -- El dueño acepta aparecer en el muro de /fundadores.
  add column if not exists founder_public boolean not null default false;

create unique index if not exists businesses_founder_number_key on public.businesses(founder_number)
  where founder_number is not null;

-- ─────────────────────────────────────────────────────────────
-- 2. Dar y quitar un cupo
-- ─────────────────────────────────────────────────────────────
/** Número asignado, o null si el negocio no califica o no quedan cupos. Uso interno (trigger y /admin). */
create or replace function public.assign_founder(p_business_id uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_total integer;
  v_months integer;
  v_number integer;
  v_until timestamptz;
begin
  -- Bloquea los ajustes: dos negocios que publican a la vez no pueden tomar el mismo número.
  select ps.founders_total, ps.founder_months into v_total, v_months from public.platform_settings ps where ps.id for update;

  if not exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.founder_number is null and not b.is_internal and b.onboarding_completed_at is not null
  ) then
    return null;
  end if;
  -- Los negocios del equipo de AuraBook no ocupan cupos.
  if exists (
    select 1 from public.business_members m join public.platform_admins a on a.user_id = m.user_id
    where m.business_id = p_business_id and m.role = 'owner'
  ) then
    return null;
  end if;

  select min(n) into v_number from generate_series(1, v_total) n
  where not exists (select 1 from public.businesses b where b.founder_number = n);
  if v_number is null then
    return null;
  end if;

  v_until := now() + make_interval(months => v_months);
  update public.businesses set founder_number = v_number, founder_since = now(), founder_until = v_until
  where id = p_business_id;
  -- Premium gratis hasta v_until: se alarga la prueba o, si ya había pagado, el periodo pagado.
  update public.subscriptions s set
    trial_started_at = coalesce(s.trial_started_at, now()),
    trial_ends_at = greatest(s.trial_ends_at, v_until)
  where s.business_id = p_business_id and s.paid_until is null;
  update public.subscriptions s set paid_until = greatest(s.paid_until, v_until)
  where s.business_id = p_business_id and s.paid_until is not null;
  return v_number;
end;
$$;

/** Libera el cupo. La prueba vuelve a durar lo normal desde que empezó; un periodo pagado no se toca. */
create or replace function public.release_founder(p_business_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.subscriptions s set
    trial_ends_at = least(s.trial_ends_at,
      coalesce(s.trial_started_at, now()) + make_interval(days => (select ps.trial_days from public.platform_settings ps)))
  where s.business_id = p_business_id and s.paid_until is null
    and exists (select 1 from public.businesses b where b.id = p_business_id and b.founder_number is not null);
  update public.businesses set founder_number = null, founder_since = null, founder_until = null, founder_public = false
  where id = p_business_id;
end;
$$;

-- Al publicar: primero la prueba normal (como antes) y, si quedan cupos, el número de fundador.
create or replace function public.start_trial_on_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions s set
    trial_started_at = now(),
    trial_ends_at = now() + make_interval(days => (select ps.trial_days from public.platform_settings ps))
  where s.business_id = new.id and s.trial_started_at is null and s.paid_until is null;
  perform public.assign_founder(new.id);
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Lectura pública (contador y muro) y opción del dueño
-- ─────────────────────────────────────────────────────────────
create or replace function public.founders_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', ps.founders_total,
    'taken', (select count(*) from public.businesses b where b.founder_number is not null),
    'months', ps.founder_months,
    'wall', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', b.founder_number, 'name', b.name, 'slug', b.slug, 'category', b.category,
        'logoUrl', b.logo_url, 'brandColor', b.brand_color
      ) order by b.founder_number)
      from public.businesses b
      where b.founder_number is not null and b.founder_public and b.is_active
    ), '[]'::jsonb)
  )
  from public.platform_settings ps where ps.id;
$$;

create or replace function public.set_founder_public(p_business_id uuid, p_visible boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.businesses set founder_public = coalesce(p_visible, false)
  where id = p_business_id and founder_number is not null;
  if not found then
    raise exception 'NOT_FOUNDER' using errcode = 'P0001';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. /admin
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_founders()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  return (
    select jsonb_build_object(
      'total', ps.founders_total,
      'months', ps.founder_months,
      'businesses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'isInternal', b.is_internal, 'founderNumber', b.founder_number,
          'founderSince', b.founder_since, 'founderUntil', b.founder_until, 'founderPublic', b.founder_public,
          'ownedByAdmin', exists (
            select 1 from public.business_members m join public.platform_admins a on a.user_id = m.user_id
            where m.business_id = b.id and m.role = 'owner')
        ))
        from public.businesses b
      ), '[]'::jsonb)
    )
    from public.platform_settings ps where ps.id
  );
end;
$$;

create or replace function public.admin_grant_founder(p_business_id uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_number integer;
begin
  perform public.assert_platform_admin();
  v_number := public.assign_founder(p_business_id);
  if v_number is null then
    raise exception 'NOT_ELIGIBLE' using errcode = 'P0001';
  end if;
  return v_number;
end;
$$;

create or replace function public.admin_revoke_founder(p_business_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  perform public.release_founder(p_business_id);
end;
$$;

/** Un negocio interno (demo o prueba) nunca ocupa un cupo: marcarlo libera el que tenía. */
create or replace function public.admin_set_business_internal(p_business_id uuid, p_internal boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  if coalesce(p_internal, false) then
    perform public.release_founder(p_business_id);
  end if;
  update public.businesses set is_internal = coalesce(p_internal, false) where id = p_business_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Negocios existentes
-- ─────────────────────────────────────────────────────────────
-- Los del equipo de AuraBook quedan marcados como internos; los demás publicados reciben su número en orden.
update public.businesses b set is_internal = true
where exists (
  select 1 from public.business_members m join public.platform_admins a on a.user_id = m.user_id
  where m.business_id = b.id and m.role = 'owner'
);

do $$
declare
  r record;
begin
  for r in
    select b.id from public.businesses b
    where b.onboarding_completed_at is not null and b.founder_number is null
    order by b.onboarding_completed_at, b.created_at
  loop
    perform public.assign_founder(r.id);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function
  public.assign_founder(uuid),
  public.release_founder(uuid),
  public.founders_summary(),
  public.set_founder_public(uuid, boolean),
  public.admin_founders(),
  public.admin_grant_founder(uuid),
  public.admin_revoke_founder(uuid),
  public.admin_set_business_internal(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.founders_summary() to anon, authenticated, service_role;
grant execute on function
  public.set_founder_public(uuid, boolean),
  public.admin_founders(),
  public.admin_grant_founder(uuid),
  public.admin_revoke_founder(uuid),
  public.admin_set_business_internal(uuid, boolean)
to authenticated;
