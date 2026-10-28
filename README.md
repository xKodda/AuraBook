# AuraBook · Plataforma de Reservas para Negocios de Belleza y Estética

Plataforma SaaS multi-rubro para gestión y agendamiento online de citas, diseñada para **barberías, peluquerías, salones de uñas, spas y centros de estética**.

---

## Novedades Fase 1 (Entregable Completo)

1. **Generalización Multi-Rubro (`barbers` → `staff`):**
   - Catálogo adaptado a cualquier rubro de estética (`businesses.category`: `barberia`, `peluqueria`, `unas`, `spa`, `estetica`, `otro`).
   - Textos contextuales dinámicos por rubro ("Elige a tu barbero", "Elige a tu estilista", "Elige a tu manicurista").
   - White-label con paleta neutra premium (marfil/grafito) y color de marca dinámico (`brand_color`) por local.
2. **Panel de Gestión (`/panel`):**
   - Visualización de la agenda diaria por local.
   - Selector entre múltiples sucursales/negocios.
   - Métricas en tiempo real: citas totales, confirmadas, completadas, no-shows e ingreso estimado.
   - Acciones de gestión rápida: completar cita, marcar inasistencia ("No asistió"), cancelar o reactivar.
   - Enlace directo a WhatsApp del cliente.
3. **Autenticación del Negocio (`/panel/login`):**
   - Inicio de sesión seguro sin contraseñas vía **Magic Link** (Supabase Auth).
   - Middleware de refresco de sesión en rutas `/panel/*`.
   - Control de acceso por membresías (`business_members`) y políticas RLS para dueños y profesionales.
4. **Portal de Gestión para el Cliente (`/reserva/[token]`):**
   - Cada reserva genera un token criptográfico único e impredecible (64 caracteres hexadecimales).
   - El cliente puede ver el estado de su cita en cualquier momento sin registrarse.
   - Botón directo para **Google Calendar** y descarga de archivo **.ics** (Apple Calendar / Outlook).
   - Botones rápidos "Cómo llegar" (Google Maps) y "WhatsApp" del local.
   - **Cancelación online** respetando el plazo de anticipación configurado por el negocio (`cancel_notice_min`).
5. **Seguridad y Anti-Abuso:**
   - Rate limiting por IP persistente en Postgres (y en memoria en demo).
   - Límite máximo de reservas activas futuras por número de teléfono (`max_active_per_phone`).
   - Integración lista para **Cloudflare Turnstile** con validación server-side.
   - Control estricto de concurrencia y solapamiento en PostgreSQL (`EXCLUDE USING gist`).

---

## Rutas Principales

| Ruta | Descripción |
|---|---|
| `/reservar/[slug]` | Página pública de reservas (ej. `/reservar/barber-studio`, `/reservar/aura-nails`, `/reservar/salon-lumiere`). |
| `/reserva/[token]` | Portal privado del cliente para ver, agregar al calendario o cancelar su cita. |
| `/` | Sitio comercial. |
| `/registro`, `/login`, `/recuperar` | Cuenta del negocio con correo y contraseña (verificación por correo). |
| `/onboarding` | Asistente: negocio → equipo → horarios → servicios → publicar. |
| `/dashboard` | Panel de control diario para dueños y profesionales del local. |
| `/dashboard/plan` | «Mi plan»: estado de la suscripción, planes y pagos del negocio (owner/admin). |
| `/admin` | Panel de plataforma (Clikium): ingresos, suscripciones, negocios, planes y pagos. |
| `/panel`, `/panel/login` | Rutas históricas: redirigen a `/dashboard` y `/login`. |

---

## 1. Ejecutar en Modo Demo (Local)

El proyecto incluye 3 negocios de prueba listos para usar sin necesidad de configurar base de datos:
- **Barber Studio** (`/reservar/barber-studio`) — Rubro barbería (color café tostado).
- **Aura Nails Studio** (`/reservar/aura-nails`) — Rubro salón de uñas (color rosa ciruela).
- **Salón Lumière** (`/reservar/salon-lumiere`) — Rubro peluquería (color índigo).

```bash
npm install
Copy-Item .env.example .env.local  # En Windows PowerShell
npm run dev
```

Abre `http://localhost:3000/dashboard` o cualquiera de las páginas de reserva públicas. Las reservas y cambios de estado en modo demo se guardan en memoria.

---

## 2. Conectar a Supabase (Producción / Datos Reales)

1. Crear un proyecto en [Supabase](https://supabase.com).
2. **Proyecto nuevo:** pegar `supabase/aurabook_setup.sql` en el **SQL Editor** y ejecutarlo una vez (son todas las
   migraciones en una transacción). **Proyecto existente:** ejecutar solo las migraciones nuevas, en orden:
   - `20261023000000_init.sql` (esquema, RLS, RPCs y restricción GiST anti-solapamiento).
   - `20261024100000_saas_roles_and_permissions.sql` (rol admin, onboarding, reserva manual).
   - `20261025000000_phase1_tenant_hardening.sql` (integridad multi-tenant y endurecimiento).
   - `20261026000000_phase2_onboarding.sql` (onboarding: perfil, equipo, servicios, horarios, publicar).
   - `20261027000000_platform_billing.sql` (planes, suscripciones, pagos y panel de plataforma).
   - `20261028000000_business_branding.sql` (logo y color de cada negocio).
   - `20261029000000_booking_notifications.sql` (correo del cliente, avisos y recordatorios).
   - `20261030000000_booking_rules.sql` (anticipación, días hacia adelante y plazo de cancelación).
   - `20261031000000_legal_acceptances.sql` (aceptación de documentos legales).
   - `20261101000000_overbooking_and_revenue.sql` (sobrecupos e ingresos por rango).
   - `20261102000000_plan_entitlements.sql` (planes Free y Premium y sus límites).
   - `20261103000000_premium_price.sql` (precio de Premium: $15.990 IVA incluido).
   - `20261104000000_premium_launch_promo.sql` (precio de lanzamiento: $12.990 los primeros 6 meses).
   - `20261105000000_time_off_management.sql` (bloqueos de agenda: crear y quitar).
   - `20261106000000_business_deletion.sql` (eliminar un negocio desde «Mi cuenta»).
   - `20261107000000_plans_v2.sql` (planes v2: límites de Free, adicionales, prueba al publicar e historial).
   - `20261108000000_plans_v3.sql` (planes v3: logo en Free, colores y ocultar marca en Premium, cuota por mes de la cita).
   - `20261109000000_insights_no_shows.sql` (estadísticas y control de ausencias).
   - `20261110000000_payment_requests.sql` (contratar Premium por transferencia, con aprobación en /admin).
   - Opcional: `supabase/002_demo_seed.sql` (datos de prueba multi-rubro; no usar en producción).
   - `supabase/legacy/` es histórico: **no ejecutar**.
3. Configurar `.env.local`:

```dotenv
DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY

# Cloudflare Turnstile (opcional en desarrollo, recomendado en producción):
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

4. En Supabase > **Authentication > URL Configuration**: definir *Site URL* (ej. `https://aurabook.cl`;
   en desarrollo `http://localhost:3000`) y agregar a *Redirect URLs*: `https://aurabook.cl/auth/confirm**` y
   `http://localhost:3000/auth/confirm**`. Definir también `NEXT_PUBLIC_SITE_URL` con el mismo dominio.
5. En **Authentication > Sign In / Providers > Email**: mantener activo *Confirm email* y fijar el largo mínimo de
   contraseña en 8 (la app exige lo mismo).
6. En **Authentication > Emails > Templates**, reemplazar el enlace de estas plantillas para que la confirmación funcione
   aunque el correo se abra en otro dispositivo o navegador:
   - *Confirm signup*: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding">Confirmar mi cuenta</a>`
   - *Reset password*: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/cuenta/nueva-clave">Crear nueva contraseña</a>`

   Sin este cambio también funciona, pero solo si el enlace se abre en el mismo navegador donde se pidió.
7. En **Authentication > SMTP Settings**: configurar un SMTP propio (Resend, Postmark, etc.). El SMTP incluido en
   Supabase tiene un límite de envíos muy bajo y no sirve para pilotos con negocios reales.
8. Tras aplicar migraciones, revisar **Advisors > Security** en el dashboard de Supabase.
9. **Acceso al panel de plataforma (`/admin`)**: regístrate en la app con tu correo, confírmalo y luego ejecuta en
   el SQL Editor (reemplaza el correo):
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'TU_CORREO@dominio.cl';
   ```
   Para cualquier otro usuario `/admin` responde 404. Desde ahí creas los planes (no hay precios en el código).
10. Opcional: `NEXT_PUBLIC_BILLING_CONTACT_WHATSAPP` (ej. `56912345678`) y `NEXT_PUBLIC_BILLING_CONTACT_EMAIL`
    habilitan los botones de contacto en «Mi plan».
11. Para vincular manualmente a un usuario registrado a un negocio existente (los negocios nuevos se crean en `/onboarding`):
```sql
insert into public.business_members (business_id, user_id, role)
values ('11111111-1111-4111-8111-111111111111', '<UUID_DEL_USUARIO_EN_AUTH_USERS>', 'owner');
```

---

## Pruebas

```bash
npm test           # unitarias + base de datos (PostgreSQL embebido con PGlite, sin Docker)
npm run typecheck
npm run build
```

Arquitectura, modelo de datos, decisiones y plan por fases: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

---

## Estructura del Proyecto

```text
app/
  reservar/[slug]/page.tsx         Página pública adaptable según rubro
  reserva/[token]/page.tsx         Portal del cliente (detalles, calendario, cancelación)
  panel/page.tsx                   Panel de agenda y control del local
  panel/login/page.tsx             Login con Magic Link
  api/availability/route.ts        GET horarios disponibles en tiempo real
  api/bookings/route.ts            POST nueva reserva con rate limit y captcha
  api/bookings/[token]/cancel/     POST cancelación por el cliente
  api/panel/bookings/              GET agenda filtrada por día y negocio
  api/panel/bookings/[id]/status/  POST cambio de estado (completar, no-show, cancelar)
  globals.css                      Sistema de diseño neutro premium + white-label
components/
  booking-experience.tsx           Flujo de agendamiento en 4 pasos con chips de día
  managed-booking-view.tsx         Vista de ticket, calendario y cancelación del cliente
  panel-experience.tsx             Tablero interactivo de agenda diaria y métricas
lib/
  types.ts                         Tipos de dominio multi-rubro (staff, category, bookings)
  theme.ts                         Copia por rubro y generación de variables CSS white-label
  business.ts                      Consulta de catálogo público
  panel.ts                         Operaciones de agenda y membresías con sesión
  bookings.ts                      Servicios de reserva gestionada por token
  rate-limit.ts                    Rate limiter por ventana fija en PostgreSQL
  turnstile.ts                     Verificación de Turnstile server-side
  permissions.ts                   Matriz de roles para la UI (la autorización real está en la BD)
  redirects.ts                     Validación de redirecciones internas post-login
supabase/
  migrations/                      Esquema PostgreSQL + RLS + RPCs (aplicar en orden)
  002_demo_seed.sql                Semillas para barbería, uñas y peluquería
  legacy/                          Esquema obsoleto con `barbers` (no ejecutar)
tests/
  core-validation.test.mjs         Pruebas unitarias de lib/
  db/                              Pruebas de RLS, aislamiento, solapamiento y onboarding
docs/ARQUITECTURA.md               Decisiones técnicas y plan por fases
```
