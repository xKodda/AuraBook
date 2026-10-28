-- ═════════════════════════════════════════════════════════════
-- Planes v3: logo en Free, color y «ocultar marca» en Premium, recordatorio en Free y cuota por mes de atención
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. Ajusta la definición final de los planes (docs/ROADMAP.md, sección 2):
--   Free:    2 profesionales, 8 servicios, 100 reservas activas al mes, logo propio, recordatorio el día antes.
--   Premium: color propio, ocultar la marca AuraBook, ingresos y estadísticas, y todo lo demás sin límites.
--
-- Cuota mensual de Free (reemplaza la regla de 20261107000000): cuenta las reservas ACTIVAS (confirmadas, completadas
-- o «no asistió») cuya cita cae en el mes calendario del negocio, en su zona horaria (America/Santiago).
--   · Las canceladas no consumen cuota: cancelar libera el cupo.
--   · Reprogramar mueve la misma reserva: no se cuenta dos veces (solo se revisa si cambia de mes).
--   · Reactivar una cancelada vuelve a consumir cuota y se valida.

-- ─────────────────────────────────────────────────────────────
-- 1. Capacidades por plan
-- ─────────────────────────────────────────────────────────────
alter table public.plans drop constraint if exists plans_features_check;
alter table public.plans add constraint plans_features_check
  check (features <@ array['client_reminders', 'revenue_stats', 'custom_branding', 'hide_branding']);

update public.plans set features = array['client_reminders'] where code = 'free';
update public.plans set features = array['client_reminders', 'revenue_stats', 'custom_branding', 'hide_branding'] where code = 'premium';

-- ─────────────────────────────────────────────────────────────
-- 2. Marca: el logo es de todos; el color propio requiere custom_branding
-- ─────────────────────────────────────────────────────────────
create or replace function public.enforce_custom_branding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.brand_color is distinct from old.brand_color and not public.business_has_feature(new.id, 'custom_branding') then
    raise exception 'PLAN_FEATURE_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_custom_branding on public.businesses;
create trigger businesses_custom_branding before update of brand_color on public.businesses
  for each row execute function public.enforce_custom_branding();

-- Ocultar «Reservas con AuraBook» en la página pública (Premium). La página lo respeta solo si el plan lo incluye.
alter table public.businesses add column if not exists hide_branding boolean not null default false;

create or replace function public.set_business_hide_branding(p_business_id uuid, p_hide boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(p_hide, false) and not public.business_has_feature(p_business_id, 'hide_branding') then
    raise exception 'PLAN_FEATURE_REQUIRED' using errcode = 'P0001';
  end if;
  update public.businesses set hide_branding = coalesce(p_hide, false) where id = p_business_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Cuota mensual por mes de atención
-- ─────────────────────────────────────────────────────────────
-- Reservas activas con cita en el mes calendario de p_day (fecha local del negocio). p_exclude: la propia fila.
create or replace function public.business_active_bookings_in_month(p_business_id uuid, p_day date, p_exclude uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.bookings b
  join public.businesses shop on shop.id = b.business_id
  where b.business_id = p_business_id
    and b.status <> 'cancelled'
    and (p_exclude is null or b.id <> p_exclude)
    and b.start_at >= (date_trunc('month', p_day::timestamp) at time zone shop.timezone)
    and b.start_at < ((date_trunc('month', p_day::timestamp) + interval '1 month') at time zone shop.timezone);
$$;

create or replace function public.business_month_full(p_business_id uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select l.max_monthly_bookings is not null
      and public.business_active_bookings_in_month(p_business_id, p_day) >= l.max_monthly_bookings
    from public.business_limits(p_business_id) l
  ), false);
$$;

-- Uso del mes en curso («Mi plan» y la página pública), con la misma regla.
create or replace function public.business_bookings_this_month(p_business_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select public.business_active_bookings_in_month(
    p_business_id, (now() at time zone (select b.timezone from public.businesses b where b.id = p_business_id))::date);
$$;

create or replace function public.enforce_monthly_booking_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
  v_tz text;
begin
  if new.status = 'cancelled' then return new; end if;
  select b.timezone into v_tz from public.businesses b where b.id = new.business_id;
  -- En una actualización solo se valida si la reserva vuelve a estar activa o cambia de mes.
  if tg_op = 'UPDATE' and old.status <> 'cancelled'
    and date_trunc('month', old.start_at at time zone v_tz) = date_trunc('month', new.start_at at time zone v_tz) then
    return new;
  end if;
  select l.max_monthly_bookings into v_max from public.business_limits(new.business_id) l;
  if v_max is null then return new; end if;
  -- Bloqueo por negocio: dos reservas simultáneas no pueden pasar ambas cuando queda un solo cupo.
  perform pg_advisory_xact_lock(hashtextextended('booking_quota:' || new.business_id::text, 0));
  if public.business_active_bookings_in_month(new.business_id, (new.start_at at time zone v_tz)::date, new.id) >= v_max then
    raise exception 'MONTHLY_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_monthly_quota on public.bookings;
create trigger bookings_monthly_quota before insert or update of status, start_at on public.bookings
  for each row execute function public.enforce_monthly_booking_quota();

-- Página pública: con el mes de una fecha completo no se ofrecen horas ese mes (los otros meses siguen disponibles).
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

-- Para el mensaje de la página pública: ¿el mes de esa fecha ya está completo?
create or replace function public.public_month_full(p_slug text, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.business_month_full(b.id, p_day) from public.businesses b where b.slug = p_slug and b.is_active), false);
$$;

-- La página pública también necesita saber si se oculta la marca.
create or replace function public.public_business_plan(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'features', to_jsonb(l.features),
      'staffIds', coalesce((select jsonb_agg(s) from public.business_bookable_staff(b.id) s), '[]'::jsonb),
      'quotaReached', l.max_monthly_bookings is not null and public.business_bookings_this_month(b.id) >= l.max_monthly_bookings,
      'hideBranding', b.hide_branding and 'hide_branding' = any(l.features)
    )
    from public.businesses b
    cross join lateral public.business_limits(b.id) l
    where b.slug = p_slug and b.is_active
  ), jsonb_build_object('features', '[]'::jsonb, 'staffIds', '[]'::jsonb, 'quotaReached', false, 'hideBranding', false));
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function
  public.business_active_bookings_in_month(uuid, date, uuid),
  public.business_month_full(uuid, date),
  public.business_bookings_this_month(uuid),
  public.enforce_monthly_booking_quota(),
  public.enforce_custom_branding()
from public, anon, authenticated;
revoke all on function public.set_business_hide_branding(uuid, boolean) from public, anon;
grant execute on function public.set_business_hide_branding(uuid, boolean) to authenticated;
revoke all on function public.public_month_full(text, date) from public;
grant execute on function public.public_month_full(text, date) to anon, authenticated;
revoke all on function public.public_business_plan(text) from public;
grant execute on function public.public_business_plan(text) to anon, authenticated;
revoke all on function public.available_slots(text, uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.available_slots(text, uuid, date, uuid) to anon, service_role;
