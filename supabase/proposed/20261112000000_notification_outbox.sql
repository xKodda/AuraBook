-- ═════════════════════════════════════════════════════════════
-- PROPUESTA (auditoría P1-02) · NO EJECUTAR EN PRODUCCIÓN HASTA APROBARLA
-- Notificaciones de reservas persistentes: estados, sin duplicados y con reintentos
-- ═════════════════════════════════════════════════════════════
-- Aditiva y re-ejecutable. Hoy el aviso al dueño se intenta una sola vez dentro de la petición (after()) y, si Resend
-- falla, se pierde sin registro. Con esta tabla:
--   1. La reserva encola sus avisos (un registro por reserva y tipo: UNIQUE impide duplicados).
--   2. Quien envía primero «reclama» el aviso (UPDATE atómico); un segundo intento simultáneo no lo obtiene.
--   3. Éxito → sent. Error → failed con reintento a los 5, 10, 20 y 40 minutos (lo toma la tarea diaria o el envío
--      siguiente); al 5.º intento → dead, visible en /admin.
--   4. Un envío que quedó «sending» más de 15 minutos (función cortada) se puede reclamar de nuevo. Para que ese caso
--      no duplique el correo, el código debe mandar el id del aviso como Idempotency-Key a Resend.
-- last_error guarda solo el resumen técnico ya redactado (lib/log-safe.ts), nunca datos del cliente.

create table if not exists public.booking_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('owner_new_booking', 'client_confirmation', 'owner_cancellation')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  last_error text check (length(last_error) <= 300),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, kind)
);
create index if not exists booking_notifications_due_idx
  on public.booking_notifications(next_attempt_at) where status in ('pending', 'failed', 'sending');

alter table public.booking_notifications enable row level security;
revoke all on table public.booking_notifications from anon, authenticated;

-- Encola (idempotente): devuelve el id del aviso, nuevo o existente.
create or replace function public.enqueue_booking_notification(p_booking_id uuid, p_kind text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.booking_notifications (booking_id, kind) values (p_booking_id, p_kind)
  on conflict (booking_id, kind) do nothing
  returning id into v_id;
  if v_id is null then
    select n.id into v_id from public.booking_notifications n where n.booking_id = p_booking_id and n.kind = p_kind;
  end if;
  return v_id;
end;
$$;

-- Reclama un aviso para enviarlo. true = este proceso lo envía; false = ya enviado, en curso o sin intentos.
create or replace function public.claim_booking_notification(p_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.booking_notifications n set status = 'sending', claimed_at = now(), attempts = n.attempts + 1
  where n.id = p_id and n.attempts < 5 and (
    (n.status in ('pending', 'failed') and n.next_attempt_at <= now())
    or (n.status = 'sending' and n.claimed_at < now() - interval '15 minutes')
  );
  return found;
end;
$$;

-- Resultado del envío. Error → reintento con espera creciente; al 5.º intento queda «dead».
create or replace function public.finish_booking_notification(p_id uuid, p_ok boolean, p_error text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.booking_notifications n set
    status = case when p_ok then 'sent' when n.attempts >= 5 then 'dead' else 'failed' end,
    sent_at = case when p_ok then now() else null end,
    last_error = case when p_ok then null else left(p_error, 300) end,
    next_attempt_at = case when p_ok then n.next_attempt_at
      else now() + make_interval(mins => 5 * power(2, greatest(n.attempts - 1, 0))::integer) end
  where n.id = p_id and n.status = 'sending';
end;
$$;

-- Avisos pendientes de reintento (para la tarea programada).
create or replace function public.due_booking_notifications(p_limit integer default 50)
returns table(id uuid, booking_id uuid, kind text)
language sql stable security definer set search_path = '' as $$
  select n.id, n.booking_id, n.kind from public.booking_notifications n
  where n.attempts < 5 and (
    (n.status in ('pending', 'failed') and n.next_attempt_at <= now())
    or (n.status = 'sending' and n.claimed_at < now() - interval '15 minutes')
  )
  order by n.next_attempt_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- /admin: salud de los avisos de los últimos 7 días.
create or replace function public.admin_notification_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  return (select jsonb_build_object(
      'sent', count(*) filter (where n.status = 'sent'),
      'pending', count(*) filter (where n.status in ('pending', 'sending', 'failed')),
      'dead', count(*) filter (where n.status = 'dead'))
    from public.booking_notifications n where n.created_at > now() - interval '7 days');
end;
$$;

revoke all on function public.enqueue_booking_notification(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_booking_notification(uuid) from public, anon, authenticated;
revoke all on function public.finish_booking_notification(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.due_booking_notifications(integer) from public, anon, authenticated;
grant execute on function public.enqueue_booking_notification(uuid, text), public.claim_booking_notification(uuid),
  public.finish_booking_notification(uuid, boolean, text), public.due_booking_notifications(integer) to service_role;
revoke all on function public.admin_notification_health() from public, anon;
grant execute on function public.admin_notification_health() to authenticated;
