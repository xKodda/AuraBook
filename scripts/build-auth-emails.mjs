// Genera las plantillas de correo de Supabase Auth (supabase/email-templates/*.html) con el mismo diseño que los
// correos de reservas (lib/email-templates.ts). Uso: node scripts/build-auth-emails.mjs
// Luego se pegan en Supabase > Authentication > Emails, cada una con el asunto indicado en su primera línea.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { authEmailHtml } from "../lib/email-templates.ts";

const OUT = join(import.meta.dirname, "..", "supabase", "email-templates");
const SITE = "{{ .SiteURL }}";
// token_hash: el enlace funciona aunque se abra en otro dispositivo o navegador (app/auth/confirm/route.ts).
const confirmLink = (type, next) => `${SITE}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`;

const TEMPLATES = [
  {
    file: "confirm-signup.html",
    where: "Confirm signup",
    subject: "Confirma tu cuenta en AuraBook",
    preheader: "Un paso más: confirma tu correo y crea tu página de reservas.",
    badge: "Bienvenido",
    title: "Confirma tu correo",
    intro: "Gracias por crear tu cuenta en AuraBook. Confirma tu correo para configurar tu negocio y publicar tu página de reservas en minutos.",
    button: { label: "Confirmar mi cuenta", href: confirmLink("email", "/onboarding") },
    foot: "Si no creaste una cuenta en AuraBook con {{ .Email }}, puedes ignorar este correo.",
  },
  {
    file: "reset-password.html",
    where: "Reset password",
    subject: "Crea una nueva contraseña para AuraBook",
    preheader: "Usa este enlace para elegir una contraseña nueva.",
    badge: "Seguridad",
    title: "Restablece tu contraseña",
    intro: "Recibimos una solicitud para cambiar la contraseña de tu cuenta ({{ .Email }}). Toca el botón para elegir una nueva.",
    button: { label: "Crear nueva contraseña", href: confirmLink("recovery", "/cuenta/nueva-clave") },
    foot: "Si no lo pediste, ignora este correo: tu contraseña actual sigue funcionando. El enlace vence en 1 hora.",
  },
  {
    file: "magic-link.html",
    where: "Magic link",
    subject: "Tu enlace para entrar a AuraBook",
    preheader: "Entra a tu panel con un toque.",
    badge: "Acceso",
    title: "Entra a AuraBook",
    intro: "Toca el botón para entrar a tu panel con {{ .Email }}.",
    button: { label: "Entrar a mi panel", href: confirmLink("email", "/dashboard") },
    foot: "Si no pediste este enlace, ignora este correo. Nadie puede entrar sin acceso a tu bandeja.",
  },
  {
    file: "change-email.html",
    where: "Change email address",
    subject: "Confirma tu nuevo correo en AuraBook",
    preheader: "Confirma el cambio de correo de tu cuenta.",
    badge: "Seguridad",
    title: "Confirma tu nuevo correo",
    intro: "Pediste cambiar el correo de tu cuenta de {{ .Email }} a <strong>{{ .NewEmail }}</strong>. Confírmalo para aplicar el cambio.",
    button: { label: "Confirmar el cambio", href: confirmLink("email_change", "/dashboard/cuenta") },
    foot: "Si no pediste este cambio, ignora este correo y cambia tu contraseña.",
  },
  {
    file: "password-changed.html",
    where: "Security notifications > Password changed",
    subject: "Tu contraseña de AuraBook cambió",
    preheader: "Aviso de seguridad de tu cuenta.",
    badge: "Seguridad",
    title: "Tu contraseña cambió",
    intro: "La contraseña de tu cuenta de AuraBook ({{ .Email }}) se cambió recién.",
    foot: `¿No fuiste tú? Restablécela ahora desde ${SITE}/recuperar y escríbenos a contacto@clikium.cl.`,
  },
];

for (const t of TEMPLATES) {
  const header = `<!-- Supabase > Authentication > Emails > ${t.where}\n     Asunto: ${t.subject}\n     GENERADO por scripts/build-auth-emails.mjs: editar ahí, no aquí. -->\n`;
  writeFileSync(join(OUT, t.file), header + authEmailHtml({ siteUrl: SITE, ...t }) + "\n");
  console.log(`${t.file} · ${t.subject}`);
}
