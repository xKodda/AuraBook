# Seguridad de la información en AuraBook

**BORRADOR — revisar antes de publicar.** Versión 0.1 · [FECHA]

Resumen público de cómo protegemos los datos. Cada punto describe una medida que **existe hoy** en el
sistema; las marcadas como *pendiente* están planificadas.

## Separación entre negocios

- Todos los negocios comparten la plataforma, pero cada dato está ligado a su negocio y la **base de datos**
  impide, mediante políticas de seguridad a nivel de fila (RLS), que un negocio vea datos de otro. No depende
  solo de la aplicación.
- Las acciones del panel verifican en la base de datos el rol de quien las realiza (propietario,
  administrador o profesional).
- Un profesional solo ve sus propias citas.

## Acceso y contraseñas

- Contraseñas gestionadas por Supabase Auth, guardadas con hash; Clikium no puede verlas.
- Verificación del correo antes de crear un negocio.
- Límite de intentos para iniciar sesión, registrarse y reservar, para frenar ataques automatizados.
- El acceso al panel de administración de la plataforma está restringido a personal autorizado de Clikium.

## Datos de los clientes finales

- Quien reserva no crea cuenta. Gestiona su cita con un enlace privado con un identificador aleatorio de
  alta entropía, que el equipo del negocio no puede ver.
- Se pide solo lo necesario: nombre, teléfono y, opcionalmente, correo.

## Infraestructura

- Comunicación cifrada (HTTPS/TLS) en todo el sitio.
- Las claves privilegiadas solo existen en el servidor; nunca se envían al navegador.
- Los archivos subidos (logos) se validan por su contenido real y su tamaño.
- Los correos se envían desde un dominio autenticado (SPF, DKIM y DMARC).

## Continuidad

- Respaldos de la base de datos: **[según plan de Supabase; pendiente pasar a Pro con respaldos diarios]**.
- *Pendiente:* monitoreo de errores y alertas.

## Incidentes

Ante una vulneración de seguridad: se contiene, se evalúa qué datos se vieron afectados, se avisa a los
negocios afectados dentro de **[72] horas** y a la autoridad cuando la ley lo exija.

## Reportar un problema de seguridad

Escríbenos a **[CORREO DE SEGURIDAD]**. Agradecemos los reportes responsables y respondemos dentro de
**[5] días hábiles**.
