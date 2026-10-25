-- AuraBook · Notificaciones de reservas
-- Aditiva y no destructiva.
--
-- 1. Correo opcional del cliente y su elección de recibir un recordatorio el día antes.
-- 2. Datos para el aviso al dueño y para la confirmación al cliente (solo servidor).
-- 3. Recordatorios del día siguiente, enviados una vez por una tarea diaria (solo servidor).
--
-- El correo se agrega con una función aparte y no cambiando la firma de create_public_booking,
-- para que el código ya desplegado siga funcionando mientras se publica la nueva versión.

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas
-- ─────────────────────────────────────────────────────────────
alter table public.bookings add column if not exists client_email text
  check (client_email is null or (length(client_email) <= 254 and client_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
alter table public.bookings add column if not exists reminder_opt_in boolean not null default false;
alter table public.bookings add column if not exists reminder_sent_at timestamptz;

-- El equipo ve el correo y la preferencia (el grant de bookings es por columnas, ver 20261025000000).
grant select (client_email, reminder_opt_in, reminder_sent_at) on table public.bookings to authenticated;

create index if not exists bookings_reminder_due_idx on public.bookings(start_at)
  where status = 'confirmed' and reminder_opt_in and reminder_sent_at is null;

-- ─────────────────────────────────────────────────────────────
-- 2. Contacto del cliente (solo service_role, justo después de crear la reserva pública)
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_public_booking_contact(p_booking_id uuid, p_email text, p_reminder boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
begin
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  update public.bookings set
    client_email = v_email,
    reminder_opt_in = coalesce(p_reminder, false) and v_email is not null
  where id = p_booking_id and source = 'web' and created_at > now() - interval '10 minutes';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Todo lo necesario para los correos de una reserva (solo service_role)
-- ─────────────────────────────────────────────────────────────
create or replace function public.booking_notification(p_booking_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'bookingId', b.id,
    'manageToken', b.public_token,
    'startAt', b.start_at,
    'endAt', b.end_at,
    'priceClp', b.price_clp,
    'clientName', b.client_name,
    'clientPhone', b.client_phone,
    'clientEmail', b.client_email,
    'reminderOptIn', b.reminder_opt_in,
    'serviceName', s.name,
    'staffName', st.name,
    'businessName', shop.name,
    'businessSlug', shop.slug,
    'businessAddress', coalesce(shop.address, ''),
    'businessPhone', coalesce(shop.phone, ''),
    'timezone', shop.timezone,
    'ownerEmails', coalesce((
      select jsonb_agg(distinct u.email)
      from public.business_members m
      join auth.users u on u.id = m.user_id
      where m.business_id = shop.id and m.role = 'owner' and u.email is not null
    ), '[]'::jsonb)
  )
  from public.bookings b
  join public.businesses shop on shop.id = b.business_id
  join public.services s on s.id = b.service_id
  join public.staff st on st.id = b.staff_id
  where b.id = p_booking_id;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Recordatorios: citas confirmadas de MAÑANA (día calendario en la zona del negocio)
-- ─────────────────────────────────────────────────────────────
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
  order by b.start_at
  limit 500;
$$;

-- Marca el envío de forma atómica: devuelve false si otro proceso ya lo marcó (evita duplicados).
create or replace function public.claim_reminder(p_booking_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.bookings set reminder_sent_at = now()
  where id = p_booking_id and reminder_sent_at is null and status = 'confirmed' and reminder_opt_in;
  return found;
end;
$$;

-- Si el envío falla, se libera para reintentar en la siguiente ejecución.
create or replace function public.release_reminder(p_booking_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.bookings set reminder_sent_at = null where id = p_booking_id;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos: solo el servidor (service_role)
-- ─────────────────────────────────────────────────────────────
revoke all on function
  public.set_public_booking_contact(uuid, text, boolean),
  public.booking_notification(uuid),
  public.due_reminders(),
  public.claim_reminder(uuid),
  public.release_reminder(uuid)
from public, anon, authenticated;

grant execute on function
  public.set_public_booking_contact(uuid, text, boolean),
  public.booking_notification(uuid),
  public.due_reminders(),
  public.claim_reminder(uuid),
  public.release_reminder(uuid)
to service_role;
