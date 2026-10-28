-- ═════════════════════════════════════════════════════════════
-- Planes v2: límites de Free, profesionales adicionales, periodicidad, prueba al publicar e historial de eventos
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. No borra datos: lo que ya existe (profesionales, servicios, reservas) se conserva aunque
-- supere un límite; los límites solo impiden operaciones NUEVAS.
--
-- Free:    $0. Hasta 2 profesionales, 8 servicios y 100 reservas nuevas al mes. Marca AuraBook (sin logo ni color propio).
-- Premium: $12.990/mes o $129.900/año (IVA incluido). 3 profesionales incluidos, +$2.990/mes por cada adicional hasta 8.
--          Servicios y reservas ilimitados, logo y color propios, recordatorios e ingresos.
--
-- Cuota mensual de reservas (Free): cuenta las reservas CREADAS en el mes calendario actual, en la zona horaria del
-- negocio, desde la página pública y desde el panel, incluidos los sobrecupos. Una reserva cancelada después sigue
-- contando (ya consumió la cuota); reprogramar una reserva existente no crea una nueva y no cuenta.
--
-- NOTA: no volver a ejecutar 20261103000000 ni 20261104000000 después de esta migración: devolverían el precio de
-- $15.990 y el precio de lanzamiento. Si ocurre, basta con ejecutar esta otra vez.

-- ─────────────────────────────────────────────────────────────
-- 1. Planes: límites y profesionales adicionales
-- ─────────────────────────────────────────────────────────────
alter table public.plans add column if not exists max_services integer check (max_services between 1 and 500);
alter table public.plans add column if not exists max_monthly_bookings integer check (max_monthly_bookings between 1 and 1000000);
alter table public.plans add column if not exists extra_staff_price_clp integer check (extra_staff_price_clp between 0 and 1000000);
alter table public.plans add column if not exists max_extra_staff integer not null default 0 check (max_extra_staff between 0 and 100);

-- Capacidades conocidas (mantener en sintonía con lib/plans.ts):
--   client_reminders  recordatorio por correo al cliente el día antes
--   revenue_stats     ingresos por semana, mes o rango en el panel
--   custom_branding   logo y color propios en la página de reservas
alter table public.plans drop constraint if exists plans_features_check;
alter table public.plans add constraint plans_features_check
  check (features <@ array['client_reminders', 'revenue_stats', 'custom_branding', 'hide_branding']);

update public.plans set
  description = 'Para empezar y para negocios pequeños.',
  max_staff = 2, max_services = 8, max_monthly_bookings = 100, features = '{}', price_clp = 0, price_yearly_clp = 0
where code = 'free';

update public.plans set
  description = 'Para negocios con equipo que quieren crecer y reducir inasistencias.',
  price_clp = 12990, price_yearly_clp = 129900, promo_price_clp = null, promo_months = null,
  max_staff = 3, extra_staff_price_clp = 2990, max_extra_staff = 5,
  max_services = null, max_monthly_bookings = null,
  features = array['client_reminders', 'revenue_stats', 'custom_branding']
where code = 'premium';

-- ─────────────────────────────────────────────────────────────
-- 2. Suscripciones: periodicidad, profesionales adicionales e inicio real de la prueba
-- ─────────────────────────────────────────────────────────────
alter table public.subscriptions add column if not exists billing_period text check (billing_period in ('monthly', 'yearly'));
alter table public.subscriptions add column if not exists extra_staff integer not null default 0 check (extra_staff between 0 and 100);
-- La prueba empieza al publicar el negocio (fin del onboarding). Null = aún no empieza. Un negocio tiene una sola prueba.
alter table public.subscriptions add column if not exists trial_started_at timestamptz;

-- Negocios existentes: su prueba ya empezó (no se les da otra).
update public.subscriptions s set trial_started_at = coalesce(b.onboarding_completed_at, b.created_at)
from public.businesses b
where b.id = s.business_id and s.trial_started_at is null and (b.is_active or b.onboarding_completed_at is not null);

-- ─────────────────────────────────────────────────────────────
-- 3. Historial de eventos de suscripción
-- ─────────────────────────────────────────────────────────────
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in (
    'trial_started', 'trial_extended', 'trial_expired', 'payment_recorded', 'paid_expired',
    'plan_changed', 'extra_staff_changed', 'cancelled', 'reactivated'
  )),
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_business_idx on public.subscription_events(business_id, created_at desc);

alter table public.subscription_events enable row level security;
revoke all on table public.subscription_events from anon, authenticated;
grant select on table public.subscription_events to authenticated;
drop policy if exists manager_subscription_events on public.subscription_events;
create policy manager_subscription_events on public.subscription_events for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']));

create or replace function public.log_subscription_event(p_business_id uuid, p_type text, p_data jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.subscription_events (business_id, type, data, created_by) values (p_business_id, p_type, p_data, auth.uid());
$$;

-- Cambios en la suscripción (hechos por /admin o por el sistema) quedan registrados.
create or replace function public.subscriptions_log_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.trial_started_at is null and new.trial_started_at is not null then
    perform public.log_subscription_event(new.business_id, 'trial_started', jsonb_build_object('trialEndsAt', new.trial_ends_at));
  elsif new.trial_ends_at > old.trial_ends_at then
    perform public.log_subscription_event(new.business_id, 'trial_extended', jsonb_build_object('from', old.trial_ends_at, 'to', new.trial_ends_at));
  end if;
  if new.plan_id is distinct from old.plan_id then
    perform public.log_subscription_event(new.business_id, 'plan_changed', jsonb_build_object('from', old.plan_id, 'to', new.plan_id));
  end if;
  if new.extra_staff <> old.extra_staff then
    perform public.log_subscription_event(new.business_id, 'extra_staff_changed', jsonb_build_object('from', old.extra_staff, 'to', new.extra_staff));
  end if;
  if old.cancelled_at is null and new.cancelled_at is not null then
    perform public.log_subscription_event(new.business_id, 'cancelled', '{}'::jsonb);
  elsif old.cancelled_at is not null and new.cancelled_at is null then
    perform public.log_subscription_event(new.business_id, 'reactivated', '{}'::jsonb);
  end if;
  return new;
end;
$$;
drop trigger if exists subscriptions_log on public.subscriptions;
create trigger subscriptions_log after update on public.subscriptions
  for each row execute function public.subscriptions_log_changes();

-- Cada pago registrado: evento y periodicidad (12 meses o más = anual).
create or replace function public.subscription_payments_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions set billing_period = case when new.months >= 12 then 'yearly' else 'monthly' end
  where business_id = new.business_id;
  perform public.log_subscription_event(new.business_id, 'payment_recorded', jsonb_build_object(
    'paymentId', new.id, 'amountClp', new.amount_clp, 'months', new.months, 'periodEnd', new.period_end));
  return new;
end;
$$;
drop trigger if exists subscription_payments_log on public.subscription_payments;
create trigger subscription_payments_log after insert on public.subscription_payments
  for each row execute function public.subscription_payments_log();

-- ─────────────────────────────────────────────────────────────
-- 4. La prueba de 30 días empieza al publicar el negocio (una sola vez)
-- ─────────────────────────────────────────────────────────────
create or replace function public.start_trial_on_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions s set
    trial_started_at = now(),
    trial_ends_at = now() + make_interval(days => (select ps.trial_days from public.platform_settings ps))
  where s.business_id = new.id and s.trial_started_at is null and s.paid_until is null;
  return new;
end;
$$;
drop trigger if exists businesses_start_trial on public.businesses;
create trigger businesses_start_trial after update of onboarding_completed_at on public.businesses
  for each row when (old.onboarding_completed_at is null and new.onboarding_completed_at is not null)
  execute function public.start_trial_on_publish();

-- ─────────────────────────────────────────────────────────────
-- 5. Capacidades efectivas (reemplaza la versión de 20261102000000 con más columnas)
-- ─────────────────────────────────────────────────────────────
drop function if exists public.my_entitlements();
drop function if exists public.business_limits(uuid);

-- max_* null = sin límite. Premium: profesionales incluidos + adicionales contratados (con tope del plan).
create function public.business_limits(p_business_id uuid)
returns table(tier text, status text, max_staff integer, max_services integer, max_monthly_bookings integer, features text[])
language sql stable security definer set search_path = '' as $$
  with sub as (
    select public.subscription_status(s.trial_ends_at, s.paid_until, s.cancelled_at) as status, s.plan_id, s.extra_staff
    from public.subscriptions s where s.business_id = p_business_id
  ),
  resolved as (
    select coalesce(sub.status, 'past_due') as status, coalesce(sub.extra_staff, 0) as extra_staff,
      case
        when sub.status = 'trial' then (select p.id from public.plans p where p.code = 'premium')
        when sub.status = 'active' then coalesce(sub.plan_id, (select p.id from public.plans p where p.code = 'premium'))
        else (select p.id from public.plans p where p.code = 'free')
      end as plan_id
    from (select 1) one left join sub on true
  )
  select
    case when coalesce(p.code, 'premium') = 'free' then 'free' else 'premium' end,
    r.status,
    case when p.max_staff is null then null
      else p.max_staff + least(case when r.status = 'active' then r.extra_staff else 0 end, p.max_extra_staff) end,
    p.max_services,
    p.max_monthly_bookings,
    -- Un plan pagado sin código (anterior a Free/Premium) recibe las capacidades de Premium.
    case when p.code is null then (select pp.features from public.plans pp where pp.code = 'premium') else p.features end
  from resolved r
  join public.plans p on p.id = r.plan_id;
$$;

-- Reservas creadas en el mes calendario actual (zona del negocio). Ver la regla al inicio del archivo.
create or replace function public.business_bookings_this_month(p_business_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.bookings b
  join public.businesses shop on shop.id = b.business_id
  where b.business_id = p_business_id
    and b.created_at >= (date_trunc('month', now() at time zone shop.timezone) at time zone shop.timezone);
$$;

create function public.my_entitlements()
returns table(
  business_id uuid, tier text, status text, max_staff integer, max_services integer, max_monthly_bookings integer,
  features text[], staff_count integer, services_count integer, bookings_this_month integer,
  trial_ends_at timestamptz, paid_until timestamptz, billing_period text, extra_staff integer
)
language sql stable security definer set search_path = '' as $$
  select m.business_id, l.tier, l.status, l.max_staff, l.max_services, l.max_monthly_bookings, l.features,
    (select count(*)::integer from public.staff st where st.business_id = m.business_id and st.is_active),
    (select count(*)::integer from public.services sv where sv.business_id = m.business_id and sv.is_active),
    public.business_bookings_this_month(m.business_id),
    s.trial_ends_at, s.paid_until, s.billing_period, s.extra_staff
  from public.business_members m
  cross join lateral public.business_limits(m.business_id) l
  left join public.subscriptions s on s.business_id = m.business_id
  where m.user_id = auth.uid();
$$;

create or replace function public.public_plans()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trialDays', (select s.trial_days from public.platform_settings s),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
      'code', p.code, 'name', p.name, 'description', coalesce(p.description, ''),
      'priceClp', p.price_clp, 'priceYearlyClp', p.price_yearly_clp, 'maxStaff', p.max_staff, 'features', to_jsonb(p.features),
      'promoPriceClp', p.promo_price_clp, 'promoMonths', p.promo_months,
      'maxServices', p.max_services, 'maxMonthlyBookings', p.max_monthly_bookings,
      'extraStaffPriceClp', p.extra_staff_price_clp, 'maxExtraStaff', p.max_extra_staff
    ) order by p.sort_order, p.price_clp) from public.plans p where p.is_active and p.code is not null), '[]'::jsonb)
  );
$$;

-- Página pública: capacidades, profesionales que se pueden reservar y si se alcanzó la cuota del mes.
create or replace function public.public_business_plan(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'features', to_jsonb(l.features),
      'staffIds', coalesce((select jsonb_agg(s) from public.business_bookable_staff(b.id) s), '[]'::jsonb),
      'quotaReached', l.max_monthly_bookings is not null and public.business_bookings_this_month(b.id) >= l.max_monthly_bookings
    )
    from public.businesses b
    cross join lateral public.business_limits(b.id) l
    where b.slug = p_slug and b.is_active
  ), jsonb_build_object('features', '[]'::jsonb, 'staffIds', '[]'::jsonb, 'quotaReached', false));
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Aplicación de los límites (triggers: valen para la página, el panel, el onboarding y cualquier RPC)
-- ─────────────────────────────────────────────────────────────

-- 6a. Cuota mensual de reservas. El bloqueo por negocio serializa las reservas simultáneas: dos solicitudes al
-- mismo tiempo no pueden pasar ambas el conteo cuando queda un solo cupo.
create or replace function public.enforce_monthly_booking_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
begin
  select l.max_monthly_bookings into v_max from public.business_limits(new.business_id) l;
  if v_max is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('booking_quota:' || new.business_id::text, 0));
  if public.business_bookings_this_month(new.business_id) >= v_max then
    raise exception 'MONTHLY_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_monthly_quota on public.bookings;
create trigger bookings_monthly_quota before insert on public.bookings
  for each row execute function public.enforce_monthly_booking_quota();

-- 6b. Servicios: no se pueden crear ni reactivar por sobre el límite del plan.
create or replace function public.enforce_service_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
begin
  if tg_op = 'UPDATE' and (old.is_active or not new.is_active) then return new; end if;
  if tg_op = 'INSERT' and not new.is_active then return new; end if;
  select l.max_services into v_max from public.business_limits(new.business_id) l;
  if v_max is not null and (
    select count(*) from public.services s where s.business_id = new.business_id and s.is_active and s.id <> new.id
  ) >= v_max then
    raise exception 'PLAN_SERVICE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists services_plan_limit on public.services;
create trigger services_plan_limit before insert or update of is_active on public.services
  for each row execute function public.enforce_service_limit();

-- 6c. Logo y color propios: solo con custom_branding. Quitar el logo siempre se permite.
create or replace function public.enforce_custom_branding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.brand_color is distinct from old.brand_color or (new.logo_url is not null and new.logo_url is distinct from old.logo_url))
    and not public.business_has_feature(new.id, 'custom_branding')
  then
    raise exception 'PLAN_FEATURE_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_custom_branding on public.businesses;
create trigger businesses_custom_branding before update of brand_color, logo_url on public.businesses
  for each row execute function public.enforce_custom_branding();

-- ─────────────────────────────────────────────────────────────
-- 7. Vencimientos: se registran una vez por periodo (lo llama el cron diario; no depende de que alguien abra la app)
-- ─────────────────────────────────────────────────────────────
create or replace function public.record_subscription_expirations()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_trial integer;
  v_paid integer;
begin
  insert into public.subscription_events (business_id, type, data)
  select s.business_id, 'trial_expired', jsonb_build_object('trialEndsAt', s.trial_ends_at)
  from public.subscriptions s
  join public.businesses b on b.id = s.business_id
  -- Solo negocios publicados: uno que nunca terminó el onboarding no «vence».
  where s.paid_until is null and s.trial_ends_at <= now() and s.cancelled_at is null
    and (b.is_active or b.onboarding_completed_at is not null)
    and not exists (select 1 from public.subscription_events e
      where e.business_id = s.business_id and e.type = 'trial_expired' and e.created_at >= s.trial_ends_at);
  get diagnostics v_trial = row_count;

  insert into public.subscription_events (business_id, type, data)
  select s.business_id, 'paid_expired', jsonb_build_object('paidUntil', s.paid_until)
  from public.subscriptions s
  where s.paid_until is not null and s.paid_until <= now() and s.cancelled_at is null
    and not exists (select 1 from public.subscription_events e
      where e.business_id = s.business_id and e.type = 'paid_expired' and e.created_at >= s.paid_until);
  get diagnostics v_paid = row_count;
  return v_trial + v_paid;
end;
$$;

-- /admin: profesionales adicionales contratados (Premium). Queda registrado como evento.
create or replace function public.admin_set_extra_staff(p_business_id uuid, p_extra integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  if p_extra is null or p_extra < 0 or p_extra > (select p.max_extra_staff from public.plans p where p.code = 'premium') then
    raise exception 'INVALID_EXTRA_STAFF' using errcode = 'P0001';
  end if;
  update public.subscriptions set extra_staff = p_extra where business_id = p_business_id;
  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function
  public.business_limits(uuid),
  public.business_bookings_this_month(uuid),
  public.log_subscription_event(uuid, text, jsonb),
  public.subscriptions_log_changes(),
  public.subscription_payments_log(),
  public.start_trial_on_publish(),
  public.enforce_monthly_booking_quota(),
  public.enforce_service_limit(),
  public.enforce_custom_branding(),
  public.record_subscription_expirations()
from public, anon, authenticated;
grant execute on function public.record_subscription_expirations() to service_role;

revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;
revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated;
revoke all on function public.public_business_plan(text) from public;
grant execute on function public.public_business_plan(text) to anon, authenticated;
revoke all on function public.admin_set_extra_staff(uuid, integer) from public, anon;
grant execute on function public.admin_set_extra_staff(uuid, integer) to authenticated;
