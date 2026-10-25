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
