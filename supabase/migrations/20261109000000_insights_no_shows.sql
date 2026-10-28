-- ═════════════════════════════════════════════════════════════
-- Estadísticas y control de ausencias (Premium)
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable.
--   revenue_stats    → estadísticas del negocio (panel_insights), además de los ingresos que ya existían.
--   no_show_control  → historial de asistencia por cliente en la agenda y política para bloquear reservas online
--                      a quien acumula ausencias. El panel siempre puede agendar a cualquiera.
-- Los montos son ESTIMADOS (precio del servicio al reservar): AuraBook no registra pagos de los clientes.

alter table public.plans drop constraint if exists plans_features_check;
alter table public.plans add constraint plans_features_check
  check (features <@ array['client_reminders', 'revenue_stats', 'custom_branding', 'hide_branding', 'no_show_control']);
update public.plans set features = array['client_reminders', 'revenue_stats', 'custom_branding', 'hide_branding', 'no_show_control']
where code = 'premium';

-- Política: bloquear reservas online desde N ausencias en los últimos 12 meses (null = sin bloqueo).
alter table public.businesses add column if not exists no_show_block_threshold integer
  check (no_show_block_threshold between 1 and 10);

-- Teléfono normalizado (solo dígitos) para reconocer a un cliente entre reservas.
create or replace function public.phone_digits(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;
create index if not exists bookings_business_phone_digits_idx on public.bookings(business_id, public.phone_digits(client_phone));

-- ─────────────────────────────────────────────────────────────
-- 1. Estadísticas de un rango (fechas locales, ambos extremos incluidos). security invoker: aplica RLS
--    (un profesional solo ve lo suyo). Requiere revenue_stats.
-- ─────────────────────────────────────────────────────────────
create or replace function public.panel_insights(p_business_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  perform public.assert_business_feature(p_business_id, 'revenue_stats');
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 370 then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;
  select b.timezone into v_tz from public.businesses b where b.id = p_business_id;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  with bk as (
    select b.staff_id, b.service_id, b.client_name, b.client_phone, b.price_clp, b.status, b.cancelled_by, b.start_at,
      public.phone_digits(b.client_phone) as phone,
      extract(epoch from (b.end_at - b.start_at)) / 60 as minutes,
      (b.start_at at time zone v_tz) as local_start
    from public.bookings b
    where b.business_id = p_business_id and b.start_at >= v_start and b.start_at < v_end
  ),
  active as (select * from bk where status <> 'cancelled'),
  first_visit as (
    select public.phone_digits(b.client_phone) as phone, min(b.start_at) as first_at
    from public.bookings b
    where b.business_id = p_business_id and b.status <> 'cancelled'
    group by 1
  ),
  clients as (
    select a.phone, count(*) as n, (select f.first_at from first_visit f where f.phone = a.phone) as first_at
    from active a group by a.phone
  ),
  days as (select d::date as day from generate_series(p_from, p_to, interval '1 day') d),
  available as (
    select wh.staff_id,
      sum(extract(epoch from (wh.closes_at - wh.opens_at)) / 60
          - coalesce(extract(epoch from (br.ends_at - br.starts_at)) / 60, 0)) as minutes
    from days
    join public.working_hours wh on wh.business_id = p_business_id and wh.weekday = extract(dow from days.day)
    left join public.staff_breaks br on br.staff_id = wh.staff_id and br.weekday = wh.weekday
    group by wh.staff_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'bookings', (select count(*) from bk),
      'confirmed', (select count(*) from bk where status = 'confirmed'),
      'completed', (select count(*) from bk where status = 'completed'),
      'noShow', (select count(*) from bk where status = 'no_show'),
      'cancelled', (select count(*) from bk where status = 'cancelled'),
      'cancelledByClient', (select count(*) from bk where status = 'cancelled' and cancelled_by = 'client'),
      -- Estimados según el precio del servicio, no pagos recibidos.
      'estimatedClp', (select coalesce(sum(price_clp), 0) from bk where status in ('confirmed', 'completed')),
      'completedClp', (select coalesce(sum(price_clp), 0) from bk where status = 'completed'),
      'lostClp', (select coalesce(sum(price_clp), 0) from bk where status = 'no_show')
    ),
    'clients', jsonb_build_object(
      'unique', (select count(*) from clients),
      'returning', (select count(*) from clients where first_at < v_start or n > 1),
      -- Nuevos = el resto (primera y única visita en el periodo); así nuevos + recurrentes = únicos.
      'new', (select count(*) from clients where not (first_at < v_start or n > 1))
    ),
    'byHour', coalesce((
      select jsonb_agg(jsonb_build_object('dow', x.dow, 'hour', x.hour, 'n', x.n) order by x.dow, x.hour)
      from (select extract(isodow from local_start)::int as dow, extract(hour from local_start)::int as hour, count(*)::int as n
            from active group by 1, 2) x
    ), '[]'::jsonb),
    'byStaff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'staffId', st.id, 'name', st.name,
        'bookings', coalesce(s.n, 0), 'completed', coalesce(s.completed, 0), 'noShow', coalesce(s.no_show, 0),
        'bookedMinutes', coalesce(s.minutes, 0)::int, 'availableMinutes', coalesce(av.minutes, 0)::int,
        'estimatedClp', coalesce(s.clp, 0)
      ) order by coalesce(s.n, 0) desc, st.name)
      from public.staff st
      left join (
        select staff_id, count(*) as n, count(*) filter (where status = 'completed') as completed,
          count(*) filter (where status = 'no_show') as no_show, sum(minutes) as minutes,
          sum(price_clp) filter (where status in ('confirmed', 'completed')) as clp
        from active group by staff_id
      ) s on s.staff_id = st.id
      left join available av on av.staff_id = st.id
      where st.business_id = p_business_id and (st.is_active or s.n is not null)
    ), '[]'::jsonb),
    'byService', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'bookings', x.n, 'estimatedClp', x.clp) order by x.n desc)
      from (select sv.name, count(*)::int as n, coalesce(sum(a.price_clp) filter (where a.status in ('confirmed', 'completed')), 0) as clp
            from active a join public.services sv on sv.id = a.service_id group by sv.name order by 2 desc limit 8) x
    ), '[]'::jsonb),
    'topNoShows', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'phone', x.client_phone, 'noShows', x.n) order by x.n desc)
      from (select max(client_name) as name, max(client_phone) as client_phone, count(*)::int as n
            from bk where status = 'no_show' group by phone order by 3 desc limit 5) x
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Historial de asistencia de clientes (para la agenda). Requiere no_show_control.
-- ─────────────────────────────────────────────────────────────
create or replace function public.panel_client_history(p_business_id uuid, p_phones text[])
returns table(phone text, total integer, completed integer, no_shows integer, cancelled integer, last_visit timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.assert_business_feature(p_business_id, 'no_show_control');
  return query
    select public.phone_digits(b.client_phone),
      count(*)::integer,
      (count(*) filter (where b.status = 'completed'))::integer,
      (count(*) filter (where b.status = 'no_show'))::integer,
      (count(*) filter (where b.status = 'cancelled'))::integer,
      max(b.start_at) filter (where b.status = 'completed')
    from public.bookings b
    where b.business_id = p_business_id
      and public.phone_digits(b.client_phone) = any(select public.phone_digits(x) from unnest(coalesce(p_phones, '{}')) x)
    group by 1;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Política de ausencias: owner/admin, requiere no_show_control para activarla (desactivarla siempre se puede).
-- ─────────────────────────────────────────────────────────────
create or replace function public.update_no_show_policy(p_business_id uuid, p_threshold integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_threshold is not null and p_threshold not between 1 and 10 then
    raise exception 'INVALID_RULES' using errcode = 'P0001';
  end if;
  if p_threshold is not null and not public.business_has_feature(p_business_id, 'no_show_control') then
    raise exception 'PLAN_FEATURE_REQUIRED' using errcode = 'P0001';
  end if;
  update public.businesses set no_show_block_threshold = p_threshold where id = p_business_id;
end;
$$;

-- Reservas desde la página pública: se rechazan si el teléfono acumula N ausencias en 12 meses y la política está
-- activa con el plan vigente. Las reservas del panel no se bloquean (el negocio decide).
create or replace function public.enforce_no_show_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_threshold integer;
begin
  if new.source <> 'web' then return new; end if;
  select b.no_show_block_threshold into v_threshold from public.businesses b where b.id = new.business_id;
  if v_threshold is null or not public.business_has_feature(new.business_id, 'no_show_control') then return new; end if;
  if (
    select count(*) from public.bookings b
    where b.business_id = new.business_id and b.status = 'no_show' and b.start_at > now() - interval '12 months'
      and public.phone_digits(b.client_phone) = public.phone_digits(new.client_phone)
  ) >= v_threshold then
    raise exception 'CLIENT_BLOCKED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_no_show_policy on public.bookings;
create trigger bookings_no_show_policy before insert on public.bookings
  for each row execute function public.enforce_no_show_policy();

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function public.enforce_no_show_policy() from public, anon, authenticated;
revoke all on function public.panel_insights(uuid, date, date) from public, anon;
grant execute on function public.panel_insights(uuid, date, date) to authenticated;
revoke all on function public.panel_client_history(uuid, text[]) from public, anon;
grant execute on function public.panel_client_history(uuid, text[]) to authenticated;
revoke all on function public.update_no_show_policy(uuid, integer) from public, anon;
grant execute on function public.update_no_show_policy(uuid, integer) to authenticated;
grant execute on function public.phone_digits(text) to anon, authenticated;
