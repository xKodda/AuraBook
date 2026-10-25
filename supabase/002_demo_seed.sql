-- CLIKIUM · Datos de prueba multi-rubro (Barbería, Uñas, Peluquería)
-- Requiere todas las migraciones de supabase/migrations/ aplicadas.
-- Ejecutar en Supabase > SQL Editor después de aplicar la migración inicial.

-- 1. Negocios de prueba
insert into public.businesses (
  id, slug, name, category, tagline, address, phone, timezone, brand_color, max_days_ahead, cancel_notice_min, onboarding_completed_at
) values
  ('11111111-1111-4111-8111-111111111111', 'barber-studio', 'Barber Studio', 'barberia', 'Tu estilo, a tu ritmo.', 'Av. Italia 1450, Providencia', '+56 9 1111 2222', 'America/Santiago', '#9A6B3F', 30, 120, now()),
  ('a2000000-0000-4000-8000-000000000000', 'aura-nails', 'Aura Nails Studio', 'unas', 'Manos impecables, sin apuros.', 'Nueva Costanera 3800, Vitacura', '+56 9 3333 4444', 'America/Santiago', '#B4577A', 45, 240, now()),
  ('a3000000-0000-4000-8000-000000000000', 'salon-lumiere', 'Salón Lumière', 'peluqueria', 'Color, corte y brillo propio.', 'José Victorino Lastarria 90, Santiago', '+56 9 5555 6666', 'America/Santiago', '#4F5D95', 60, 1440, now())
on conflict (id) do nothing;

-- 2. Servicios
insert into public.services (id, business_id, name, description, price_clp, duration_min, sort_order)
values
  -- Barber Studio
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Corte clásico', 'Corte y terminaciones de precisión', 12000, 30, 1),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Corte + barba', 'Experiencia completa para tu estilo', 17000, 45, 2),
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Perfilado de barba', 'Líneas limpias y definición', 8000, 30, 3),

  -- Aura Nails
  ('a2100000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000000', 'Manicure semipermanente', 'Esmaltado de larga duración y cutícula', 18000, 60, 1),
  ('a2100000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000000', 'Pedicure spa', 'Exfoliación, hidratación y esmaltado', 22000, 75, 2),
  ('a2100000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000000', 'Uñas acrílicas', 'Set completo con diseño a elección', 32000, 120, 3),
  ('a2100000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000000', 'Retiro + manicure express', 'Retiro seguro y limado', 12000, 45, 4),

  -- Salón Lumière
  ('a3100000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000000', 'Corte y brushing', 'Diagnóstico, lavado, corte y peinado', 25000, 60, 1),
  ('a3100000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000000', 'Coloración completa', 'Tinte raíz a puntas con tratamiento', 55000, 120, 2),
  ('a3100000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000000', 'Balayage', 'Iluminación a mano alzada + matiz', 85000, 180, 3),
  ('a3100000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000000', 'Peinado para evento', 'Ondas, recogidos o liso pulido', 20000, 45, 4)
on conflict (id) do nothing;

-- 3. Profesionales (Staff)
insert into public.staff (id, business_id, name, role_title, sort_order)
values
  -- Barber Studio
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Carlos', 'Barbero senior', 1),
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Matías', 'Barbero', 2),

  -- Aura Nails
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000000', 'Valentina', 'Manicurista', 1),
  ('a2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000000', 'Fernanda', 'Nail artist', 2),

  -- Salón Lumière
  ('a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000000', 'Antonia', 'Estilista senior', 1),
  ('a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000000', 'Diego', 'Colorista', 2)
on conflict (id) do nothing;

-- 4. Habilitación de servicios por profesional
insert into public.staff_services (business_id, staff_id, service_id)
values
  -- Carlos (Barber Studio): todos los servicios
  ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222'),
  ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333'),
  ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444'),
  -- Matías (Barber Studio): corte y combo
  ('11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222'),
  ('11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666', '33333333-3333-4333-8333-333333333333'),

  -- Valentina (Aura Nails)
  ('a2000000-0000-4000-8000-000000000000', 'a2000000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000000', 'a2000000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000002'),
  ('a2000000-0000-4000-8000-000000000000', 'a2000000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000004'),
  -- Fernanda (Aura Nails)
  ('a2000000-0000-4000-8000-000000000000', 'a2000000-0000-4000-8000-000000000002', 'a2100000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000000', 'a2000000-0000-4000-8000-000000000002', 'a2100000-0000-4000-8000-000000000003'),
  ('a2000000-0000-4000-8000-000000000000', 'a2000000-0000-4000-8000-000000000002', 'a2100000-0000-4000-8000-000000000004'),

  -- Antonia (Salón Lumière)
  ('a3000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001'),
  ('a3000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000002'),
  ('a3000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000003'),
  ('a3000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000004'),
  -- Diego (Salón Lumière)
  ('a3000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000002', 'a3100000-0000-4000-8000-000000000002'),
  ('a3000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000002', 'a3100000-0000-4000-8000-000000000003')
on conflict do nothing;

-- 5. Horarios de atención (Lunes a Sábado)
insert into public.working_hours (staff_id, weekday, opens_at, closes_at)
select '55555555-5555-4555-8555-555555555555', weekday, '10:00'::time, '20:00'::time
from generate_series(1, 6) weekday
on conflict (staff_id, weekday) do nothing;

insert into public.working_hours (staff_id, weekday, opens_at, closes_at)
select '66666666-6666-4666-8666-666666666666', weekday, '11:00'::time, '19:00'::time
from generate_series(2, 6) weekday
on conflict (staff_id, weekday) do nothing;

insert into public.working_hours (staff_id, weekday, opens_at, closes_at)
select 'a2000000-0000-4000-8000-000000000001', weekday, '10:00'::time, '19:00'::time
from generate_series(1, 6) weekday
on conflict (staff_id, weekday) do nothing;

insert into public.working_hours (staff_id, weekday, opens_at, closes_at)
select 'a2000000-0000-4000-8000-000000000002', weekday, '11:00'::time, '20:00'::time
from generate_series(2, 6) weekday
on conflict (staff_id, weekday) do nothing;

insert into public.working_hours (staff_id, weekday, opens_at, closes_at)
select 'a3000000-0000-4000-8000-000000000001', weekday, '10:00'::time, '19:00'::time
from generate_series(1, 6) weekday
on conflict (staff_id, weekday) do nothing;

insert into public.working_hours (staff_id, weekday, opens_at, closes_at)
select 'a3000000-0000-4000-8000-000000000002', weekday, '10:00'::time, '18:00'::time
from generate_series(1, 5) weekday
on conflict (staff_id, weekday) do nothing;

-- 6. Pausas y descansos (14:00 - 15:00)
insert into public.staff_breaks (staff_id, weekday, starts_at, ends_at)
select s.id, w.weekday, '14:00'::time, '15:00'::time
from public.staff s
join public.working_hours w on w.staff_id = s.id
where not exists (
  select 1 from public.staff_breaks b
  where b.staff_id = s.id and b.weekday = w.weekday and b.starts_at = '14:00'::time
);

-- NOTA: Para asociar un usuario del panel en producción:
-- insert into public.business_members (business_id, user_id, role)
-- values ('11111111-1111-4111-8111-111111111111', '<UUID_DE_AUTH_USERS>', 'owner');
