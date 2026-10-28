# AuraBook · Arquitectura y decisiones técnicas

Última revisión: 2026-10-25 (Fase 2, primera entrega).

## 1. Estado real del proyecto

| Área | Estado | Notas |
|---|---|---|
| Flujo público `/reservar/[slug]` | **Funciona** en demo y con Supabase | Servicio → profesional → fecha → hora → datos → confirmación. |
| Disponibilidad | **Real** (`available_slots`) | Horario por profesional, descansos, `time_off`, anticipación mínima, ventana máxima, duración del servicio. |
| Anti-solapamiento | **Garantizado en BD** | `EXCLUDE USING gist (staff_id, tstzrange)` sobre reservas confirmadas. |
| Portal del cliente `/reserva/[token]` | **Funciona** | Token de 64 hex; cancelación respetando `cancel_notice_min`. |
| Panel `/dashboard` | **Parcial** | Agenda diaria y cambio de estado. Gestión posterior de equipo/servicios/horarios: Fase 3. |
| Cuenta | **Correo + contraseña** (Fase 2) | Registro, verificación, login y recuperación. |
| Onboarding `/onboarding` | **Funciona** (Fase 2) | Asistente de 5 pasos; publica la página de reservas. Sin logotipo aún. |
| Sitio comercial `/` | **Funciona** (Fase 2) | Página informativa con llamado a registro. |
| Datos simulados | `lib/demo.ts` | Activo con `DEMO_MODE=true` (por defecto en desarrollo). Producción nunca lo activa salvo que se defina explícitamente. Registro y onboarding requieren Supabase. |
| Supabase | **Sin proyecto conectado** | Las migraciones se validan con PGlite (ver §8). |

_Estado de la tabla actualizado a la Fase 2._

## 2. Modelo multi-tenant

Una sola base de datos compartida. **Toda tabla de negocio lleva `business_id`** y las relaciones entre
entidades del mismo negocio usan **FK compuestas** `(id, business_id)`, de modo que la base de datos
rechaza, por ejemplo, una reserva con el servicio de un negocio y el profesional de otro.

```
auth.users ──< business_members >── businesses ──< services
                 (role, staff_id)        │    └──< staff ──< staff_services >── services
                                         │              ├──< working_hours
                                         │              ├──< staff_breaks
                                         │              └──< time_off
                                         └──< bookings (service_id, staff_id, public_token)
```

### Capas de autorización

1. **RLS en todas las tablas** con `revoke all` previo (Supabase concede privilegios amplios por defecto).
2. **`anon`** solo lee catálogo activo (negocios, servicios, profesionales, habilitaciones). Nunca reservas,
   teléfonos, membresías ni horarios internos.
3. **`authenticated`** lee solo negocios donde tiene membresía (`is_member`, `has_business_role`,
   `can_see_booking`). No tiene permisos de escritura directa sobre ninguna tabla.
4. **Escrituras** pasan por funciones `security definer` que validan membresía y rol dentro de la BD
   (`panel_set_booking_status`, `panel_create_booking`, `create_business_with_owner`).
5. **Reservas públicas y token del cliente** solo vía `service_role` desde Route Handlers del servidor
   (`create_public_booking`, `get_booking_by_token`, `cancel_booking_by_token`). La clave nunca llega al navegador
   (`lib/supabase.ts` es `server-only`).

Cambiar un `business_id` o un `slug` desde el navegador no da acceso a nada: el servidor y la BD resuelven
el acceso desde `auth.uid()`, no desde parámetros del cliente.

### Roles

| Rol | Ve | Puede |
|---|---|---|
| `owner` | Todo el negocio y su equipo | Todo, incluida configuración y usuarios. |
| `admin` | Todo el negocio y su equipo | Operación: agenda, reservas, equipo, servicios (no configuración crítica). |
| `staff` (Profesional) | Solo sus reservas y su membresía | Gestionar su propia agenda. |

Un usuario puede tener membresías en varios negocios (`business_members` con PK `(business_id, user_id)`).
Un perfil profesional (`staff`) se vincula como máximo a un usuario.

## 3. Decisiones

- **Se mantiene el nombre `staff`** (no se renombra a `professionals`). Ya es neutral respecto del rubro, no quedan
  referencias a `barbers` en el esquema activo, y renombrar obligaría a tocar migraciones, RPCs, tipos y UI sin
  beneficio funcional. En la interfaz se muestra como "Profesional" / texto según rubro (`lib/theme.ts`).
  El rol `staff` en `business_members` también se mantiene; en la UI se llama "Profesional".
- **Horarios por profesional** (no por negocio) como fuente de verdad de disponibilidad. El onboarding podrá
  ofrecer "aplicar el horario del local a todos".
- **Reserva manual fuera de horario permitida**: el equipo puede agendar fuera del horario laboral (ej. un favor a un
  cliente), pero nunca solapada con otra reserva ni con un servicio que el profesional no ofrece.
- **Sobrecupo** (`bookings.is_overbook`, migración 20261101000000): desde el panel se puede agendar a sabiendas sobre
  una hora ocupada. Esas reservas quedan fuera de `bookings_no_overlap`, pero siguen ocupando la hora en
  `available_slots`, así que la página pública nunca ofrece ese horario. En la agenda se marcan como «Sobrecupo».
- **Planes Free y Premium** (migración 20261102000000): lo que puede usar un negocio sale de una sola función,
  `business_limits` (prueba vigente o pago vigente → Premium; lo demás → Free). La lista de capacidades vive en
  `plans.features` y se describe en `lib/plans.ts` (`can`, `canAddStaff`); ninguna pantalla compara nombres de plan.
  Se aplica en la base de datos: `save_staff` (no agregar por sobre el límite), `available_slots` (la página pública solo
  ofrece a los primeros profesionales que caben en el plan), `due_reminders` y `panel_revenue`. Nunca se cancela una
  reserva ni se archiva a nadie por bajar de plan.
- **Planes v2** (migración 20261107000000): Free = 2 profesionales, 8 servicios y 100 reservas nuevas al mes, marca
  AuraBook; Premium = $12.990/mes o $129.900/año (IVA incluido), 3 profesionales + adicionales a $2.990 (hasta 8),
  servicios y reservas ilimitados, logo y color (`custom_branding`), recordatorios e ingresos. Los límites se aplican con
  **triggers** (valen para la página, el panel y cualquier RPC): cuota mensual en `bookings` (con bloqueo por negocio
  para solicitudes simultáneas), servicios activos y cambios de marca. La cuota cuenta reservas **creadas** en el mes
  calendario del negocio (página y panel, incluidos sobrecupos; una cancelada sigue contando; reprogramar no cuenta).
  **Planes v3** (20261108000000) cambia esa regla: cuenta reservas **activas** cuya **cita** cae en el mes (las
  canceladas liberan el cupo; reactivar o mover de mes se valida) y `available_slots` no ofrece horas de un mes
  completo. El logo es de todos; `custom_branding` = colores y `hide_branding` = ocultar «Reservas con AuraBook».
  La prueba de 30 días empieza al publicar el negocio y es una sola (`subscriptions.trial_started_at`). Todo cambio
  queda en `subscription_events` (prueba, pagos, plan, adicionales, cancelación y vencimientos; estos últimos los
  registra el cron diario con `record_subscription_expirations`). Al bajar a Free nada se borra.
- **Pagos:** no hay pasarela. Los pagos se registran a mano en `/admin` (`admin_record_payment`) y la periodicidad
  se deduce del pago (12 meses o más = anual). Para cobro recurrente (Flow, Mercado Pago o Webpay Oneclick): un módulo
  `lib/payments/<proveedor>.ts` con la misma interfaz (crear suscripción, cancelar), y un webhook
  `/api/payments/webhook` que verifique la firma del proveedor, sea idempotente (id del evento del proveedor guardado
  con restricción única) y llame a una función de base de datos tipo `admin_record_payment` con `service_role`.
  Nunca activar un plan con datos enviados desde el navegador.
- **Ingresos** (`panel_revenue`): suma por día de las reservas confirmadas y completadas, en fechas locales del negocio y
  con ambos extremos incluidos. Es `security invoker`, así que un profesional solo suma sus propias reservas. El panel
  muestra la semana (lunes a domingo) y el mes en curso (del día 1 al último día real del mes), y un rango libre de
  hasta un año.
- **Onboarding**: requiere correo verificado, máximo 3 negocios por propietario (ajustable en
  `create_business_with_owner`), zona horaria válida y slugs reservados.
- **`public_token`** es la credencial del cliente: el equipo no puede leerlo (grant por columnas). La reserva manual sí
  lo devuelve al crearla, para enviarlo al cliente por WhatsApp.
- **Fechas**: `timestamptz` en BD; la conversión hora local ↔ UTC se hace con la zona del negocio en PostgreSQL
  (`at time zone`) y en `lib/dates.ts`. Probado a ambos lados del cambio de horario de Chile.

## 4. Modelo de datos objetivo v1

Existente y vigente: `businesses`, `business_members`, `staff`, `services`, `staff_services`, `working_hours`,
`staff_breaks`, `time_off`, `bookings`, `rate_limits`.

Pendiente, por fase (todo aditivo):

| Fase | Cambio |
|---|---|
| 3 | `business_invitations` (invitar admin/profesional por correo). RPCs de gestión de servicios, equipo y horarios. Cierres del local completo (feriados): `time_off` con `staff_id` nulo o tabla `business_closures`. |
| 5 | `customers` por negocio (teléfono normalizado único por negocio) y `bookings.customer_id` opcional. |

## 5. Plan de la Fase 1

| # | Tarea | Estado |
|---|---|---|
| 1 | Auditoría de código, esquema y seguridad | Hecho |
| 2 | `business_id` + FK compuesta en `working_hours`, `staff_breaks`, `time_off` | Hecho (`20261025000000`) |
| 3 | `business_members.staff_id` restringido al mismo negocio | Hecho |
| 4 | `has_business_role` y visibilidad del equipo para owner/admin | Hecho |
| 5 | Ocultar `public_token` al panel | Hecho |
| 6 | Endurecer onboarding y reserva manual | Hecho |
| 7 | Validar zona horaria de negocios | Hecho |
| 8 | Redirección abierta en `/auth/callback`, logout con 303, UUIDs en API, errores internos ocultos | Hecho |
| 9 | Pruebas de BD (RLS, aislamiento, concurrencia, onboarding) con PGlite | Hecho (`tests/db/`) |
| 10 | Aplicar migraciones en un proyecto Supabase real y revisar *Security Advisor* | **Pendiente (requiere credenciales)** |
| 11 | Configuración de Auth en Supabase (ver README) | **Pendiente (manual)** |
| 12 | Decidir registro: solo magic link o también contraseña | Decidido: correo + contraseña |

## 6. Fase 2 — Registro y onboarding

Migración `20261026000000_phase2_onboarding.sql`.

- **Cuenta**: correo + contraseña (`/registro`, `/login`, `/recuperar`, `/cuenta/nueva-clave`) con server actions
  en `app/auth/actions.ts`. La verificación de correo llega a `/auth/confirm`, que acepta `token_hash` (funciona en
  cualquier dispositivo) y `code` (PKCE, mismo navegador). Las respuestas no revelan si un correo tiene cuenta.
- **Publicación**: `businesses.is_active` significa *publicado*. Un negocio creado en onboarding nace sin publicar
  (invisible para `anon`, sin disponibilidad ni reservas) y `complete_onboarding` lo publica solo si tiene al menos un
  profesional activo, un servicio, cada servicio con profesional y algún horario. `onboarding_completed_at` guarda la
  primera publicación. Si más adelante se necesita *suspender* negocios, agregar una columna distinta.
- **Orden del asistente**: Negocio → Equipo → Horarios → Servicios → Publicar. El equipo va antes que los horarios
  porque los horarios son por profesional; para un negocio unipersonal, la opción «Soy yo» vincula al propietario
  como profesional.
- **RPCs nuevas** (todas `security definer`, rol verificado con `auth.uid()`): `update_business_profile` y
  `complete_onboarding` (owner); `save_staff`, `archive_staff`, `save_service`, `archive_service`,
  `set_weekly_schedule` (owner/admin); `slug_available` (feedback del formulario).
- **Archivar, no borrar**: profesionales y servicios se desactivan para conservar el historial de reservas. No se puede
  archivar un profesional con reservas futuras confirmadas.
- **Límites anti-abuso**: 3 negocios por propietario, 50 profesionales y 100 servicios por negocio.
- **Rutas**: el panel pasa a `/dashboard`; `/panel` y `/panel/login` redirigen. Se eliminó el endpoint de magic link.

Pendiente de Fase 2: logotipo (requiere bucket de Supabase Storage con políticas por negocio; se hará junto con la
configuración del negocio en Fase 3) y página de términos y privacidad.

## 7. Suscripciones y panel de plataforma

Migración `20261027000000_platform_billing.sql`. Sin pasarela de pago (fuera del alcance del MVP): los pagos se
registran a mano en `/admin` y todo lo demás se calcula a partir de ellos.

- **`platform_admins`**: administradores de AuraBook. Solo se agregan por SQL. `/admin` responde 404 a los demás.
- **`plans`**: editables desde `/admin` (nombre, precio mensual, máximo de profesionales). Archivar un plan no afecta a
  quienes ya lo tienen. Ningún precio está escrito en el código.
- **`subscriptions`**: una por negocio, creada automáticamente (trigger) con `trial_ends_at = now() + trial_days`.
- **`subscription_payments`**: cada pago extiende `paid_until`. El periodo empieza en
  `greatest(paid_until, trial_ends_at, now())`, así que pagar durante la prueba no le quita días al cliente.
- **Estado calculado** (`subscription_status`): `cancelled` → `active` (pagado vigente) → `trial` (sin pagos y prueba
  vigente) → `past_due`. No hay cron ni columnas que se desactualicen.
- **Sin bloqueo** (decisión para pilotos): un plan vencido o el exceso de profesionales sobre el límite del plan solo
  generan avisos (en el panel del dueño y en «Requieren atención» de `/admin`). Activar un bloqueo después implica
  revisar el estado en `available_slots` y `create_public_booking`.
- **Métricas**: MRR = suma de precios de planes con estado `active`; «cobrado» = suma de pagos por `paid_at` (mes
  calendario de Chile). `admin_snapshot()` devuelve todo en una sola llamada, adecuado para decenas de negocios; con
  cientos habrá que paginar la lista de negocios.
- **Acceso**: todas las tablas sin privilegios directos; todo pasa por RPC `security definer`. El dueño usa
  `get_business_subscription` (owner/admin del negocio) y `my_subscriptions`.

## 8. Pruebas

```bash
npm test          # unitarias (lib/ real) + base de datos (tests/db/)
npm run typecheck
npm run build
```

`tests/db/` levanta PostgreSQL 17 embebido (PGlite) con un stub mínimo de Supabase (`auth.uid()`, roles
`anon`/`authenticated`/`service_role`, privilegios por defecto), aplica **todas** las migraciones y la semilla, y
verifica aislamiento entre negocios, roles, solapamientos y onboarding.

Limitaciones: no ejecuta PostgREST ni GoTrue, no simula transacciones concurrentes reales (la garantía de
concurrencia la da la restricción de exclusión, que sí se prueba) y los grants por defecto de Supabase real
pueden diferir. Las migraciones deben probarse además en un proyecto Supabase de staging.
