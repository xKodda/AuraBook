# Documentos legales de AuraBook (BORRADORES)

> **Estos textos son borradores de trabajo, no asesoría legal.** Deben ser revisados por un abogado
> chileno antes de publicarse, en especial frente a la **Ley 21.719** de protección de datos personales
> (vigente desde el 1 de diciembre de 2026, según su texto publicado; confirmar).

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

## Antes de publicar

1. Completar los campos entre `[CORCHETES]`.
2. Confirmar la región de los servidores de Supabase del proyecto (Settings → General).
3. Revisión de un abogado.
4. Publicar como páginas `/terminos` y `/privacidad`, agregar la casilla de aceptación en `/registro`
   (con fecha y versión aceptada guardadas en BD) y enlaces en el pie de cada página de reservas.
5. Cada cambio sustancial: nueva versión con fecha, y aviso por correo a los negocios.
