-- AuraBook · Avisos push en el teléfono del equipo (Web Push)
-- Aditiva y no destructiva. Independiente de las migraciones de supabase/proposed/.
--
-- 1. Cada navegador (teléfono o computador) donde un usuario activa los avisos guarda una suscripción.
-- 2. El usuario solo crea o borra las suyas (RPC con auth.uid()); nadie lee la tabla directamente.
-- 3. El servidor obtiene los destinos de una reserva (dueños y administradores del negocio) y registra el resultado
--    de cada envío: una suscripción que el servicio de push da por inexistente se borra.

-- ─────────────────────────────────────────────────────────────
-- 1. Tabla
-- ─────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 1000 and endpoint ~ '^https://'),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth_secret text not null check (length(auth_secret) between 10 and 100),
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Sin políticas: con RLS activo y sin grants, solo las funciones de abajo tocan la tabla.
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Funciones del usuario (authenticated)
-- ─────────────────────────────────────────────────────────────
-- Guarda (o reasigna) la suscripción de este navegador al usuario actual. Máximo 10 por usuario: se borran las más antiguas.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_endpoint is null or length(p_endpoint) > 1000 or p_endpoint !~ '^https://'
     or p_p256dh is null or length(p_p256dh) not between 40 and 200
     or p_auth is null or length(p_auth) not between 10 and 100 then
    raise exception 'INVALID_SUBSCRIPTION' using errcode = 'P0001';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, nullif(left(trim(coalesce(p_user_agent, '')), 300), ''))
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    user_agent = excluded.user_agent,
    failure_count = 0;

  delete from public.push_subscriptions p
  where p.user_id = v_user
    and p.id not in (
      select q.id from public.push_subscriptions q where q.user_id = v_user order by q.created_at desc limit 10
    );
end;
$$;

-- Borra la suscripción de este navegador, solo si es del usuario actual.
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Funciones del servidor (service_role)
-- ─────────────────────────────────────────────────────────────
-- Destinos para el aviso de una reserva: navegadores de los dueños y administradores del negocio.
create or replace function public.booking_push_targets(p_booking_id uuid)
returns table (endpoint text, p256dh text, auth_secret text)
language sql stable security definer set search_path = '' as $$
  select distinct p.endpoint, p.p256dh, p.auth_secret
  from public.bookings b
  join public.business_members m on m.business_id = b.business_id and m.role in ('owner', 'admin')
  join public.push_subscriptions p on p.user_id = m.user_id
  where b.id = p_booking_id;
$$;

-- Resultado de un envío. `p_gone`: el servicio de push respondió 404/410 (el navegador ya no existe) → se borra.
-- Tras 5 fallos seguidos por otros motivos también se borra.
create or replace function public.record_push_result(p_endpoint text, p_ok boolean, p_gone boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_ok then
    update public.push_subscriptions set last_success_at = now(), failure_count = 0 where endpoint = p_endpoint;
  elsif p_gone then
    delete from public.push_subscriptions where endpoint = p_endpoint;
  else
    update public.push_subscriptions set failure_count = failure_count + 1 where endpoint = p_endpoint;
    delete from public.push_subscriptions where endpoint = p_endpoint and failure_count >= 5;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
revoke all on function
  public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text),
  public.booking_push_targets(uuid),
  public.record_push_result(text, boolean, boolean)
from public, anon, authenticated;

grant execute on function
  public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text)
to authenticated;

grant execute on function
  public.booking_push_targets(uuid),
  public.record_push_result(text, boolean, boolean)
to service_role;
