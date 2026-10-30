-- ═════════════════════════════════════════════════════════════
-- PROPUESTA (auditoría P1-01) · NO EJECUTAR EN PRODUCCIÓN HASTA APROBARLA
-- Una prueba Premium por persona cada 12 meses, con excepciones autorizadas desde /admin
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. Hoy la prueba es por negocio: eliminar el negocio y crear otro da 30 días nuevos
-- (demostrado 5 veces seguidas con la misma cuenta). Con esta propuesta:
--   • Cada prueba otorgada se anota en trial_grants con el hash SHA-256 del correo del dueño (no el correo): la marca
--     sobrevive a eliminar el negocio o la cuenta y volver a registrarse con el mismo correo.
--   • Un dueño que ya tuvo una prueba en los últimos 12 meses no recibe otra: ni durante la configuración ni al publicar.
--     Su negocio queda en Free y se registra el evento «trial_denied».
--   • Excepción legítima: /admin → «Extender prueba» (admin_extend_trial, ya existente) da los días que se decida y
--     queda registrado quién lo hizo (subscription_events.created_by).
-- No resuelve el registro con correos distintos: eso requiere una señal extra (teléfono verificado o revisión manual).
-- Ojo: no volver a ejecutar 20261107000000_plans_v2.sql después de esta migración (reemplazaría start_trial_on_publish).

create table if not exists public.trial_grants (
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  business_id uuid references public.businesses(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (email_hash, granted_at)
);
alter table public.trial_grants enable row level security;
revoke all on table public.trial_grants from anon, authenticated;

create or replace function public.email_hash(p_email text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex');
$$;

-- ¿Algún dueño de este negocio (o el usuario indicado) ya tuvo una prueba en otro negocio en los últimos 12 meses?
create or replace function public.trial_used_by(p_user_id uuid, p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trial_grants g
    join auth.users u on public.email_hash(u.email) = g.email_hash
    where u.id = p_user_id and u.email is not null
      and g.granted_at > now() - interval '365 days'
      and g.business_id is distinct from p_business_id
  );
$$;

-- Eventos: se agrega «trial_denied» a los tipos permitidos.
alter table public.subscription_events drop constraint if exists subscription_events_type_check;
alter table public.subscription_events add constraint subscription_events_type_check check (type in (
  'trial_started', 'trial_extended', 'trial_expired', 'payment_recorded', 'paid_expired',
  'plan_changed', 'extra_staff_changed', 'cancelled', 'reactivated', 'trial_denied'
));

-- Al crear el negocio: si quien lo crea ya usó su prueba, no hay Premium durante la configuración.
create or replace function public.create_trial_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (business_id, trial_ends_at)
  select new.id, case when auth.uid() is not null and public.trial_used_by(auth.uid(), new.id) then now()
    else now() + make_interval(days => s.trial_days) end
  from public.platform_settings s
  on conflict (business_id) do nothing;
  return new;
end;
$$;

-- Al publicar: prueba completa y se anota; o se niega si algún dueño ya la usó.
create or replace function public.start_trial_on_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_used boolean;
begin
  if not exists (select 1 from public.subscriptions s
    where s.business_id = new.id and s.trial_started_at is null and s.paid_until is null) then
    return new;
  end if;
  select coalesce(bool_or(public.trial_used_by(m.user_id, new.id)), false) into v_used
  from public.business_members m where m.business_id = new.id and m.role = 'owner';

  if v_used then
    update public.subscriptions s set trial_ends_at = least(s.trial_ends_at, now())
    where s.business_id = new.id and s.trial_started_at is null and s.paid_until is null;
    perform public.log_subscription_event(new.id, 'trial_denied', jsonb_build_object('reason', 'trial_already_used'));
    return new;
  end if;

  update public.subscriptions s set
    trial_started_at = now(),
    trial_ends_at = now() + make_interval(days => (select ps.trial_days from public.platform_settings ps))
  where s.business_id = new.id and s.trial_started_at is null and s.paid_until is null;
  insert into public.trial_grants (email_hash, business_id)
  select distinct public.email_hash(u.email), new.id
  from public.business_members m join auth.users u on u.id = m.user_id
  where m.business_id = new.id and m.role = 'owner' and u.email is not null
  on conflict do nothing;
  return new;
end;
$$;

-- Pruebas ya otorgadas: se anotan para que sus dueños no obtengan otra.
insert into public.trial_grants (email_hash, business_id, granted_at)
select distinct public.email_hash(u.email), s.business_id, s.trial_started_at
from public.subscriptions s
join public.business_members m on m.business_id = s.business_id and m.role = 'owner'
join auth.users u on u.id = m.user_id
where s.trial_started_at is not null and u.email is not null
on conflict do nothing;

revoke all on function public.trial_used_by(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_trial_subscription() from public, anon, authenticated;
revoke all on function public.start_trial_on_publish() from public, anon, authenticated;
revoke all on function public.email_hash(text) from public, anon, authenticated;
