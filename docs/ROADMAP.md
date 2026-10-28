# AuraBook · Producto, planes y hoja de ruta

Última revisión: 2026-10-27. Documento vivo: actualizar al cerrar cada etapa.

## 0. Estado y próxima sesión (actualizado 2026-10-27)

**En producción con el último push:** planes Free/Premium con límites aplicados en la base de datos, `/precios`,
`/demo`, SEO (robots, sitemap, Open Graph), ingresos por semana/mes/rango, reservas manuales con sobrecupo,
textos legales oficiales v1.0, panel optimizado para celular y Premium a $15.990 con precio de lanzamiento de $12.990
los primeros 6 meses. Migraciones hasta `20261104000000`.

**Pendientes de configuración (no son código):**
1. ~~Hecho~~ Supabase → Authentication → URL Configuration: *Site URL* = `https://aurabook.clikium.cl` y *Redirect URLs* con
   `https://aurabook.clikium.cl/**`. Es la causa de que el enlace de confirmación lleve a localhost.
2. ~~Hecho~~ Vercel → `NEXT_PUBLIC_SITE_URL=https://aurabook.clikium.cl` en Production y redeploy (también lo usan el sitemap y
   las imágenes para compartir).
3. ~~Hecho~~ Precios publicados con IVA incluido; Clikium SpA emite boleta o factura.
4. ~~Medir Core Web Vitals~~ Hecho 2026-10-26 con Lighthouse (celular): portada 96–99, `/precios` 97–99, `/demo` 98–99;
   accesibilidad 100 y en computador 100 en rendimiento. Volver a medir en PageSpeed Insights tras cada cambio grande
   de la portada (la cortina de entrada es lo que más pesa en el LCP).

**Siguiente trabajo sugerido, en orden:**
1. ~~Bloqueos de agenda y aviso de cancelación~~ y ~~agenda semanal~~ (hecho 2026-10-27).
2. ~~«Mi cuenta»~~ (hecho 2026-10-27; Términos y Privacidad 1.1 mencionan ambas vías: panel y correo).
3. `/admin`: editar el precio anual y ver el plan efectivo (Free/Premium) de cada negocio.
4. Invitaciones al equipo (cada profesional con su acceso), que sería otra capacidad de Premium.

## 1. Posicionamiento

AuraBook **no compite en funciones** con AgendaPro, Fresha o Setmore. Compite en:

- **Precio:** que un emprendimiento pequeño pueda usarlo gratis y que el plan pagado cueste menos que una hora de trabajo al mes.
- **Simplicidad:** configurado en 10 minutos, sin capacitación.
- **Celular primero:** el cliente reserva sin descargar nada ni crear cuenta; el dueño administra desde el teléfono.

Regla para decidir qué construir: *si una función no ayuda a llenar la agenda de un emprendimiento pequeño o a ahorrarle tiempo, no entra.*

## 2. Planes: gratis y pagado

> **Ajuste 2026-10-27 (planes v3, migración 20261108000000):** el logo es de todos los planes; Premium suma colores
> propios y ocultar la marca AuraBook; el recordatorio el día antes está en Free; la cuota de 100 cuenta reservas
> activas por mes de la cita (las canceladas no cuentan). Tabla comparativa en `/precios` (`lib/plans.ts`).
> Próximo en Premium: estadísticas + control de ausencias, reservas combinadas y abonos online (requiere pasarela).
>
> **Vigente desde 2026-10-27 (planes v2, migración 20261107000000):** Free ($0: 2 profesionales, 8 servicios,
> 100 reservas nuevas al mes, marca AuraBook) y Premium ($12.990/mes o $129.900/año, IVA incluido; 3 profesionales
> + $2.990 por adicional hasta 8; ilimitado en servicios y reservas; logo y color; antes: hasta 3 profesionales,
> recordatorio al cliente e ingresos por semana y mes). Prueba de Premium por 30 días sin tarjeta y sin cobro automático;
> al terminar pasa a Free. Precios publicados en `/precios`; capacidades en `lib/plans.ts` y `public.business_limits`.
> Un plan superior (más de 3 profesionales, $19.990–$24.990) queda en estudio, sin anunciar.
> La propuesta original de abajo se conserva como referencia.

### Criterio

1. **Lo gratis debe servir de verdad** a quien trabaja solo. Si el plan gratis no sirve, nadie llega al pagado.
2. **Se cobra por lo que crece con el negocio** (más personas en el equipo) **o por lo que nos cuesta dinero** (correos, almacenamiento).
3. **Nunca se bloquea una reserva ya tomada** por un tema de plan. Si se supera un límite, se avisa y se pide subir de plan.

### Propuesta

| | **Gratis** | **Emprende** (pagado) |
|---|---|---|
| Página de reservas propia (`/reservar/tu-negocio`) | ✓ | ✓ |
| Logo y color de marca | ✓ | ✓ |
| Profesionales | **1** | Hasta 5 (más: precio por profesional adicional) |
| Servicios y horarios | Ilimitados | Ilimitados |
| Reservas por mes | Ilimitadas | Ilimitadas |
| Aviso de cada reserva al dueño por correo | ✓ | ✓ |
| Confirmación por correo al cliente | ✓ | ✓ |
| **Recordatorio por correo el día antes** | — | ✓ |
| Reservas manuales (WhatsApp / presencial) desde el panel | ✓ | ✓ |
| Bloqueos de agenda (vacaciones, feriados, imprevistos) | ✓ | ✓ |
| Accesos para el equipo (cada profesional con su login) | — | ✓ |
| Historial y ficha de clientes | Últimos 30 días | Completo |
| Estadísticas (reservas, ingresos estimados, inasistencias) | — | ✓ |
| Exportar reservas y clientes (CSV) | ✓ (es su información) | ✓ |
| Texto «Reservas con AuraBook» en la página | Visible | Se puede ocultar |
| Soporte | Correo | Correo y WhatsApp |

**Por qué estos cortes:**

- Un barbero o manicurista independiente puede funcionar entero en el plan gratis. Esa es la promesa de «economizar».
- El salto a pagado ocurre cuando **entra una segunda persona al equipo**: ahí el negocio ya factura más y el valor de AuraBook es evidente.
- Los recordatorios son pagados porque cuestan envíos de correo y porque **reducen inasistencias**, lo que es plata directa para el negocio y fácil de explicar.
- Exportar datos es gratis: los datos son del negocio. Retenerlos para forzar el pago genera desconfianza (y la nueva ley de datos favorece la portabilidad).

### Precio

- Rango sugerido para validar en pilotos: **$4.990 a $9.990 CLP al mes**, con descuento por pago anual (por ejemplo, 2 meses gratis).
- Probar con los primeros negocios antes de fijarlo. Los planes ya se editan desde `/admin` sin tocar código.
- Considerar un precio «fundador» congelado para los primeros 20–30 negocios a cambio de opiniones y testimonios.

### Lo que hay que construir para que los planes funcionen

| # | Tarea | Estado |
|---|---|---|
| P1 | Plan **Gratis** por defecto para todo negocio nuevo | Hecho: al terminar la prueba o el pago, pasa a Free |
| P2 | Prueba de Premium al registrarse; al terminar, vuelve a Free sin perder datos | Hecho: 30 días, sin tarjeta |
| P3 | Funciones por plan en la BD (`plans.features`) y validación en servidor | Hecho para recordatorios e ingresos; accesos de equipo y ocultar marca, cuando existan |
| P4 | Límite de profesionales activos según el plan | Hecho: no se pueden agregar más y la página pública ofrece solo a los que caben |
| P5 | Pantalla «Mejorar plan» clara desde el panel y avisos al acercarse a un límite | Hecho: «Mi plan», avisos de fin de prueba y de límite de equipo |
| P6 | Cobro automático con pasarela chilena (Flow, Mercado Pago o Webpay Oneclick) | Después de validar el precio |
| P7 | **Boleta o factura electrónica** por cada cobro (obligación tributaria de Clikium ante el SII) | Manual por ahora (Clikium SpA la emite); automatizar junto con P6 |

## 3. Hoja de ruta

### Etapa A — Antes del primer piloto real (imprescindible)

| # | Tarea | Por qué |
|---|---|---|
| A1 | ~~Términos, privacidad y tratamiento de datos~~ | Hecho: versión oficial 1.0, aceptada al registrarse |
| A2 | **Vercel Pro** (o equivalente) | El plan Hobby de Vercel es solo para uso personal no comercial |
| A3 | **Supabase Pro** para producción | Respaldos diarios y sin pausa por inactividad |
| A4 | ~~Aviso al dueño cuando un cliente cancela~~ | Hecho: correo a los dueños cuando el cliente cancela desde su enlace |
| A5 | ~~Gestión desde el panel~~ | Hecho: Equipo, Servicios, Horarios y Datos y marca |
| A6 | ~~Bloqueos de agenda~~ | Hecho: «Bloqueos» en el panel (días completos o algunas horas, por persona o todo el equipo) y aviso en la agenda |
| A7 | ~~**Reserva manual** desde el panel~~ | Hecho: «Nueva reserva» en la agenda, con sobrecupo opcional |
| A8 | ~~Eliminar cuenta y negocio, y exportar datos (CSV)~~ | Hecho: «Mi cuenta» con cambio de contraseña, descarga de reservas y clientes, y eliminación (la facturación se conserva anonimizada) |
| A9 | Monitoreo de errores (por ejemplo, Sentry) y correo de soporte visible | Enterarse de un problema antes que el cliente |
| A10 | Página de ayuda corta (preguntas frecuentes) | Parcial: preguntas en la portada y en `/precios`; falta ayuda dentro del panel |

### Etapa B — Planes y cobro (P1 a P7 de la sección 2)

### Etapa C — Que el producto se recomiende solo

| # | Tarea |
|---|---|
| C1 | **Invitar al equipo**: cada profesional entra con su correo y ve solo su agenda (los roles ya existen en BD) |
| C2 | ~~Agenda semanal~~ Hecho: grilla por hora con color por profesional y bloqueos (lista por día en celular) |
| C3 | **Ficha de cliente**: historial de visitas, inasistencias y notas, reconocida por teléfono |
| C4 | ~~Botón de WhatsApp prellenado~~ Hecho en cada cita de la agenda |
| C5 | **PWA**: instalar el panel en el teléfono como una app |
| C6 | Código QR imprimible con el enlace de reservas, para el local |
| C7 | Estadísticas simples: ~~ingresos por semana, mes o rango~~ (hecho); faltan horas más pedidas e inasistencias |
| C8 | Programa de referidos: un mes gratis por cada negocio que se suscriba recomendado |

### Más adelante (solo si los pilotos lo piden)

Lista de espera, reseñas, abono o pago online de la reserva, recordatorios por WhatsApp (API pagada), varias sucursales, dominio propio.

### Fuera de alcance (decisión)

Inventario, punto de venta, comisiones, marketplace, inteligencia artificial. Agregan complejidad y alejan el producto de su promesa.

## 4. Costos de operación a considerar

| Servicio | Uso | Nota |
|---|---|---|
| Vercel | Hosting de la app | Uso comercial requiere plan Pro |
| Supabase | Base de datos, autenticación y logos | Pro recomendado para producción |
| Resend | Correos | El plan gratuito tiene límites diarios y mensuales; revisar al crecer |
| Dominio | `aurabook.clikium.cl` | Evaluar `aurabook.cl` propio |

Precios vigentes: consultar las páginas de cada proveedor. Con pocos negocios pagados se cubren los costos fijos; calcular el punto de equilibrio cuando el precio esté definido.
