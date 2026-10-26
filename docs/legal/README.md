# Documentos legales de AuraBook

Versión oficial **1.0**, publicada el 25 de octubre de 2026 (revisada por el titular). Se muestran en
`/terminos`, `/privacidad`, `/tratamiento-datos` y `/seguridad`, generadas a partir de estos archivos.
La versión aceptada al registrarse se guarda con `LEGAL_VERSION` (lib/legal.ts).

## Documentos

| Archivo | Para quién | Se acepta |
|---|---|---|
| [terminos.md](terminos.md) | Negocios que usan AuraBook | Al crear la cuenta (casilla obligatoria) |
| [privacidad.md](privacidad.md) | Negocios y usuarios finales que reservan | Enlazada en registro y en cada página de reservas |
| [tratamiento-datos.md](tratamiento-datos.md) | Negocios (anexo a los términos) | Junto con los términos |
| [seguridad.md](seguridad.md) | Público (resumen de medidas) | Informativo |

## Rol de cada parte frente a los datos

- **Datos de los usuarios finales** (nombre, teléfono, correo de quien reserva): el **negocio** decide para qué
  los usa → es el **responsable**. **Clikium** los trata por encargo del negocio → es **encargado**.
  Por eso existe el acuerdo de tratamiento de datos.
- **Datos de las cuentas de los negocios** (correo del dueño, datos de facturación): **Clikium** es responsable.

## Datos completados con la realidad técnica actual

Los textos describen lo que el sistema hace hoy (revisado contra el código el 2026-10-25):

- Datos de reserva: nombre, teléfono, correo opcional, servicio, profesional, fecha, preferencia de recordatorio.
- Datos de cuenta: correo y contraseña (la contraseña la gestiona Supabase Auth; Clikium no la ve).
- Datos técnicos: dirección IP usada temporalmente para limitar abusos (se elimina al día siguiente).
- No se usan cookies de publicidad ni analítica de terceros; solo cookies de sesión necesarias para iniciar sesión.
- Proveedores (subencargados): Supabase (base de datos y archivos), Vercel (hosting), Resend (correos);
  Cloudflare (Turnstile) si se activa el captcha.

## Datos del operador y pendientes

- Operador: Clikium SpA, RUT 78.399.278-7.
- Región del proyecto de Supabase (Settings → General), para precisar la tabla de proveedores.

## Al cambiar un texto

1. Subir la versión y la fecha en el encabezado del documento.
2. Si el cambio es sustancial: subir `LEGAL_VERSION` y avisar por correo a los negocios con 15 días de anticipación.
