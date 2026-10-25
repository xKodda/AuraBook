# AuraBook · Producto, planes y hoja de ruta

Última revisión: 2026-10-25. Documento vivo: actualizar al cerrar cada etapa.

## 1. Posicionamiento

AuraBook **no compite en funciones** con AgendaPro, Fresha o Setmore. Compite en:

- **Precio:** que un emprendimiento pequeño pueda usarlo gratis y que el plan pagado cueste menos que una hora de trabajo al mes.
- **Simplicidad:** configurado en 10 minutos, sin capacitación.
- **Celular primero:** el cliente reserva sin descargar nada ni crear cuenta; el dueño administra desde el teléfono.

Regla para decidir qué construir: *si una función no ayuda a llenar la agenda de un emprendimiento pequeño o a ahorrarle tiempo, no entra.*

## 2. Planes: gratis y pagado

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
| P1 | Plan **Gratis** por defecto para todo negocio nuevo (hoy nacen en «prueba gratis» sin plan) | Pendiente |
| P2 | Prueba de **Emprende** por 14 días al registrarse; al terminar, vuelve a Gratis sin perder datos | Pendiente |
| P3 | Funciones por plan en la BD (`plans.features`: recordatorios, accesos de equipo, estadísticas, ocultar marca) y validación en servidor | Pendiente |
| P4 | Límite de profesionales activos según el plan (hoy solo se informa) | Pendiente |
| P5 | Pantalla «Mejorar plan» clara desde el panel y avisos al acercarse a un límite | Pendiente |
| P6 | Cobro automático con pasarela chilena (Flow, Mercado Pago o Webpay Oneclick) | Después de validar el precio |
| P7 | **Boleta o factura electrónica** por cada cobro (obligación tributaria de Clikium ante el SII) | Antes del primer cobro |

## 3. Hoja de ruta

### Etapa A — Antes del primer piloto real (imprescindible)

| # | Tarea | Por qué |
|---|---|---|
| A1 | **Términos y condiciones, política de privacidad y acuerdo de tratamiento de datos** publicados y aceptados al registrarse (borradores en `docs/legal/`) | Requisito legal; la Ley 21.719 entra en vigencia en diciembre de 2026 |
| A2 | **Vercel Pro** (o equivalente) | El plan Hobby de Vercel es solo para uso personal no comercial |
| A3 | **Supabase Pro** para producción | Respaldos diarios y sin pausa por inactividad |
| A4 | Aviso al dueño cuando un cliente **cancela** | Hoy solo se ve en el panel |
| A5 | **Gestión desde el panel** (Fase 3): editar equipo, servicios y horarios sin volver al onboarding | Hoy el único camino es `/onboarding` |
| A6 | **Bloqueos de agenda**: vacaciones, feriados, horas tomadas por fuera | La tabla `time_off` existe, falta la pantalla |
| A7 | **Reserva manual** desde el panel | La función de BD existe (`panel_create_booking`), falta la pantalla |
| A8 | Eliminar cuenta y negocio, y exportar datos (CSV) | Derechos de los titulares de datos |
| A9 | Monitoreo de errores (por ejemplo, Sentry) y correo de soporte visible | Enterarse de un problema antes que el cliente |
| A10 | Página de ayuda corta (preguntas frecuentes) | Bajar las consultas de soporte |

### Etapa B — Planes y cobro (P1 a P7 de la sección 2)

### Etapa C — Que el producto se recomiende solo

| # | Tarea |
|---|---|
| C1 | **Invitar al equipo**: cada profesional entra con su correo y ve solo su agenda (los roles ya existen en BD) |
| C2 | Agenda **semanal** en el panel, además de la diaria |
| C3 | **Ficha de cliente**: historial de visitas, inasistencias y notas, reconocida por teléfono |
| C4 | Botón de **WhatsApp** prellenado para confirmar o recordar una cita (sin costo de API) |
| C5 | **PWA**: instalar el panel en el teléfono como una app |
| C6 | Código QR imprimible con el enlace de reservas, para el local |
| C7 | Estadísticas simples: reservas por semana, horas más pedidas, ingresos estimados, inasistencias |
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
