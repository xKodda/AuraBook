-- ═════════════════════════════════════════════════════════════
-- Planes Free y Premium, y capacidades por plan en un solo lugar
-- ═════════════════════════════════════════════════════════════
-- Sin pérdida de datos: agrega columnas a plans, crea los planes Free y Premium, oculta (no borra) los planes
-- anteriores y agrega funciones. Los pagos y suscripciones existentes no cambian.
--
-- Regla única (business_limits): qué puede usar un negocio sale SIEMPRE de aquí, nunca de condiciones sueltas.
--   prueba vigente           → Premium
--   pagado y vigente         → el plan pagado (los planes anteriores sin código cuentan como Premium,
--                              con su propio límite de profesionales)
--   prueba o pago vencido,
--   cancelado o sin datos    → Free
-- Nunca se bloquea una reserva ya tomada ni se archiva a nadie: al bajar a Free, la página pública solo ofrece
-- a los primeros profesionales que caben en el plan, y no se pueden agregar más hasta subir de plan.

-- ─────────────────────────────────────────────────────────────
-- 1. Planes con código, capacidades y precio anual
-- ─────────────────────────────────────────────────────────────
-- Capacidades conocidas (mantener en sintonía con lib/plans.ts):
--   client_reminders  recordatorio por correo al cliente el día antes
--   revenue_stats     ingresos por semana, mes o rango en el panel
alter table public.plans add column if not exists code text unique check (code in ('free', 'premium'));
alter table public.plans add column if not exists features text[] not null default '{}'
  check (features <@ array['client_reminders', 'revenue_stats']);
alter table public.plans add column if not exists price_yearly_clp integer check (price_yearly_clp between 0 and 100000000);

insert into public.plans (code, name, description, price_clp, price_yearly_clp, max_staff, features, is_active, sort_order)
values
  ('free', 'Free', 'Para quien atiende solo.', 0, 0, 1, '{}', true, 0),
  ('premium', 'Premium', 'Para negocios con equipo que quieren menos inasistencias.', 12990, 129900, 3,
    array['client_reminders', 'revenue_stats'], true, 1)
on conflict (code) do nothing;

-- Los planes anteriores dejan de ofrecerse, pero se conservan para el historial de pagos.
update public.plans set is_active = false where code is null and is_active;

-- Prueba de Premium por 30 días para los negocios nuevos (solo si seguía el valor por defecto).
update public.platform_settings set trial_days = 30, updated_at = now() where id and trial_days = 14;

-- ─────────────────────────────────────────────────────────────
-- 2. Capacidades efectivas de un negocio (interna)
-- ─────────────────────────────────────────────────────────────
-- max_staff null = sin límite.
create or replace function public.business_limits(p_business_id uuid)
returns table(tier text, status text, max_staff integer, features text[])
language sql stable security definer set search_path = '' as $$
  with sub as (
    select public.subscription_status(s.trial_ends_at, s.paid_until, s.cancelled_at) as status, s.plan_id
    from public.subscriptions s where s.business_id = p_business_id
  ),
  resolved as (
    select coalesce(sub.status, 'past_due') as status,
      case
        when sub.status = 'trial' then (select p.id from public.plans p where p.code = 'premium')
        when sub.status = 'active' then coalesce(sub.plan_id, (select p.id from public.plans p where p.code = 'premium'))
        else (select p.id from public.plans p where p.code = 'free')
      end as plan_id
    from (select 1) one left join sub on true
  )
  select
    case when coalesce(p.code, 'premium') = 'free' then 'free' else 'premium' end as tier,
    r.status,
    p.max_staff,
    -- Un plan pagado sin código (anterior a Free/Premium) recibe las capacidades de Premium.
    case when p.code is null
      then (select pp.features from public.plans pp where pp.code = 'premium')
      else p.features end as features
  from resolved r
  join public.plans p on p.id = r.plan_id;
$$;

create or replace function public.business_has_feature(p_business_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p_feature = any(l.features) from public.business_limits(p_business_id) l), false);
$$;

-- Profesionales que la página pública puede ofrecer: los primeros que caben en el plan (por orden del panel).
create or replace function public.business_bookable_staff(p_business_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select st.id
  from public.staff st
  where st.business_id = p_business_id and st.is_active
  order by st.sort_order, st.id
  limit (select l.max_staff from public.business_limits(p_business_id) l);
$$;

-- Para el panel: falla si el usuario no es miembro o el plan no incluye la capacidad.
create or replace function public.assert_business_feature(p_business_id uuid, p_feature text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_business_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.business_has_feature(p_business_id, p_feature) then
    raise exception 'PLAN_FEATURE_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

-- Capacidades de los negocios del usuario (cualquier rol), para mostrar u ocultar funciones en el panel.
create or replace function public.my_entitlements()
returns table(business_id uuid, tier text, status text, max_staff integer, features text[], staff_count integer)
language sql stable security definer set search_path = '' as $$
  select m.business_id, l.tier, l.status, l.max_staff, l.features,
    (select count(*)::integer from public.staff st where st.business_id = m.business_id and st.is_active)
  from public.business_members m
  cross join lateral public.business_limits(m.business_id) l
  where m.user_id = auth.uid();
$$;

-- Planes publicados para /precios (público).
create or replace function public.public_plans()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trialDays', (select s.trial_days from public.platform_settings s),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
      'code', p.code, 'name', p.name, 'description', coalesce(p.description, ''),
      'priceClp', p.price_clp, 'priceYearlyClp', p.price_yearly_clp, 'maxStaff', p.max_staff, 'features', to_jsonb(p.features)
    ) order by p.sort_order, p.price_clp) from public.plans p where p.is_active and p.code is not null), '[]'::jsonb)
  );
$$;

-- Para la página pública de un negocio publicado: capacidades (por ejemplo, ofrecer el recordatorio) y
-- profesionales que se pueden reservar según el plan.
create or replace function public.public_business_plan(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'features', to_jsonb(l.features),
      'staffIds', coalesce((select jsonb_agg(s) from public.business_bookable_staff(b.id) s), '[]'::jsonb)
    )
    from public.businesses b
    cross join lateral public.business_limits(b.id) l
    where b.slug = p_slug and b.is_active
  ), jsonb_build_object('features', '[]'::jsonb, 'staffIds', '[]'::jsonb));
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Aplicación de los límites
-- ─────────────────────────────────────────────────────────────

-- 3a. Profesionales: no se pueden agregar ni reactivar por sobre el límite del plan.
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
  v_active integer;
  v_plan_max integer;
  v_was_active boolean;
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

  select count(*) into v_active from public.staff s where s.business_id = p_business_id and s.is_active;
  select l.max_staff into v_plan_max from public.business_limits(p_business_id) l;

  if p_staff_id is null then
    if v_active >= c_max_staff then
      raise exception 'STAFF_LIMIT_REACHED' using errcode = 'P0001';
    end if;
    if v_plan_max is not null and v_active >= v_plan_max then
      raise exception 'PLAN_STAFF_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.staff (business_id, name, role_title, sort_order)
    values (
      p_business_id, v_clean_name, nullif(trim(p_role_title), ''),
      coalesce((select max(s.sort_order) + 1 from public.staff s where s.business_id = p_business_id), 0)
    ) returning id into v_id;
  else
    select s.is_active into v_was_active from public.staff s where s.id = p_staff_id and s.business_id = p_business_id;
    if v_was_active is false and v_plan_max is not null and v_active >= v_plan_max then
      raise exception 'PLAN_STAFF_LIMIT' using errcode = 'P0001';
    end if;
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

-- 3b. Página pública: solo ofrece a los profesionales que caben en el plan. Las reservas ya tomadas no cambian,
-- y el panel puede seguir agendando a cualquiera del equipo.
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
      and st.id in (select public.business_bookable_staff(shop.id))
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

-- 3c. Recordatorios: solo se envían si el plan del negocio los incluye al momento del envío.
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
    and public.business_has_feature(b.business_id, 'client_reminders')
  order by b.start_at
  limit 500;
$$;

-- 3d. Ingresos: requieren la capacidad revenue_stats. Sigue siendo security invoker (aplica RLS).
create or replace function public.panel_revenue(p_business_id uuid, p_from date, p_to date)
returns table(day date, total_clp bigint, bookings integer)
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.assert_business_feature(p_business_id, 'revenue_stats');
  return query
    select (b.start_at at time zone shop.timezone)::date,
           sum(b.price_clp)::bigint,
           count(*)::integer
    from public.bookings b
    join public.businesses shop on shop.id = b.business_id
    where b.business_id = p_business_id
      and b.status in ('confirmed', 'completed')
      and p_from <= p_to and p_to - p_from <= 370
      and b.start_at >= (p_from::timestamp at time zone shop.timezone)
      and b.start_at < ((p_to + 1)::timestamp at time zone shop.timezone)
    group by 1
    order by 1;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function
  public.business_limits(uuid),
  public.business_has_feature(uuid, text),
  public.business_bookable_staff(uuid)
from public, anon, authenticated;

revoke all on function public.assert_business_feature(uuid, text) from public, anon;
grant execute on function public.assert_business_feature(uuid, text) to authenticated;

revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;

revoke all on function public.public_business_plan(text) from public;
grant execute on function public.public_business_plan(text) to anon, authenticated;

revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated;

revoke all on function public.panel_revenue(uuid, date, date) from public, anon;
grant execute on function public.panel_revenue(uuid, date, date) to authenticated;
