# Respaldo y recuperación de emergencia

El plan gratuito de Supabase no guarda respaldos descargables. Este procedimiento cubre ese hueco con lo que ya
tiene el proyecto: la **estructura** sale de las mismas migraciones (`supabase/migrations/` →
`supabase/aurabook_setup.sql`) y los **datos** se descargan con un script.

## Qué se respalda

| Parte | Cómo | Dónde queda |
| --- | --- | --- |
| Estructura (tablas, reglas de seguridad, funciones) | Copia de `supabase/aurabook_setup.sql`, generado desde las migraciones | `estructura.sql` |
| Datos de todas las tablas de `public` | API de Supabase con la clave de servicio | `datos.json` |
| Cuentas (correo, confirmación, metadatos) | API de administración de cuentas | `datos.json` → `users` |
| Logos de los negocios | Storage, bucket `business-logos` | `archivos/` |

**No incluye:**
- **Contraseñas.** Supabase no las entrega por API. Tras una restauración, cada persona entra con «¿Olvidaste tu contraseña?».
- **`rate_limits`.** Son contadores temporales.
- **Configuración de Supabase y Vercel.** Variables de entorno, plantillas de correo de Auth, URL del sitio y dominios: están anotadas en `README.md` y `.env.example`.

La lista de tablas sale de las migraciones. `tests/db/backup.test.mjs` falla si se agrega una tabla nueva y
no queda respaldada ni excluida a propósito, y también si `aurabook_setup.sql` no está al día con las migraciones.

## Hacer un respaldo

```bash
npm run backup
```

Usa `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de `.env.local` y **solo lee**. Crea
`backups/AAAA-MM-DD_HHMM/`. Ese archivo contiene datos personales de clientes:

- `backups/` está en `.gitignore`: nunca se sube a Git.
- Guarda una copia fuera del computador (por ejemplo, una carpeta privada en Drive) y borra las antiguas.
- Recomendado: **una vez por semana** y **siempre antes de aplicar una migración** en producción.

## Restaurar

### Caso A: se perdió el proyecto de Supabase (o hay que empezar de cero)

1. Crea un proyecto nuevo en Supabase (región São Paulo, como el actual).
2. **Estructura:** SQL Editor → pega `estructura.sql` del respaldo → *Run*. Es el mismo `aurabook_setup.sql` de
   siempre: crea tablas, permisos, funciones, planes y el bucket de logos.
3. **Datos:** genera el SQL con la dirección del proyecto nuevo, para que los logos apunten bien:
   ```bash
   npm run restore -- sql backups/AAAA-MM-DD_HHMM --nueva-url https://NUEVO.supabase.co
   ```
   Pega `backups/AAAA-MM-DD_HHMM/restaurar-datos.sql` en el SQL Editor → *Run*. Va en un solo bloque: o carga
   todo, o no cambia nada.
4. **Cuentas y logos**, con las claves del proyecto nuevo (Settings → API):
   ```bash
   RESTORE_SUPABASE_URL=https://NUEVO.supabase.co RESTORE_SERVICE_ROLE_KEY=... npm run restore -- cuentas backups/AAAA-MM-DD_HHMM
   ```
   Crea cada cuenta con su mismo id (así sigue ligada a su negocio) y vuelve a subir los logos.
5. **Configuración:**
   - Supabase: Auth → URL del sitio `https://aurabook.cl` y Redirect URLs `https://aurabook.cl/**`; plantillas de correo (`supabase/email-templates/`); SMTP de Resend.
   - Vercel: cambia `NEXT_PUBLIC_SUPABASE_URL`, la clave pública y `SUPABASE_SERVICE_ROLE_KEY` por las del proyecto nuevo y vuelve a desplegar.
6. **Comprueba:** abre una página de reservas, entra al panel (con «¿Olvidaste tu contraseña?») y revisa /admin y /fundadores.

### Caso B: se borraron o dañaron datos en el proyecto actual

Solo los pasos 3 y 4, sin `--nueva-url`. El paso 3 **reemplaza** todas las tablas por las del respaldo: se pierde
lo que haya entrado después de ese respaldo. Por eso, antes de restaurar, haz un `npm run backup` del estado
actual. El paso 4 no borra nada: las cuentas y logos que ya existen se dejan como están.

## Verificado

- Restauración completa probada en `tests/db/backup.test.mjs`: los datos quedan idénticos al original, se borran
  los datos que sobraban en el destino y los triggers vuelven a funcionar.
- Respaldo real de producción del 15/11/2026: 18 tablas, 6 cuentas y 2 logos. Su `restaurar-datos.sql` se cargó
  completo en una base de prueba, con los mismos conteos por tabla.
- **Sin verificar:** la restauración de cuentas y logos (`cuentas`) en un proyecto de Supabase real. Conviene
  probarla una vez en un proyecto de prueba antes de necesitarla.
