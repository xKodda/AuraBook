// Correos transaccionales de reservas. Funciones puras: reciben datos y devuelven asunto + HTML + texto.
// Todo valor que viene del cliente o del negocio se escapa (un nombre podría traer HTML).
//
// Diseño compatible con clientes de correo (Gmail, Outlook, Apple Mail): tablas, estilos en línea, sin CSS externo,
// sin fuentes web y sin imágenes salvo el ícono de AuraBook (PNG, porque Gmail no muestra SVG).
// Sin dependencias: lo usan también las pruebas y scripts/build-auth-emails.mjs (plantillas de Supabase Auth).

// URL absoluta y fija del ícono (mismo valor que CANONICAL_ORIGIN en lib/domains.ts): no depende de la Site URL de
// Supabase ni de NEXT_PUBLIC_SITE_URL, que en desarrollo apuntan a localhost y dejan la imagen rota en el correo.
const LOGO_URL = "https://aurabook.cl/brand/aurabook-icono-192.png";

export type BookingEmailData = {
  manageToken: string;
  startAt: string;
  endAt: string;
  priceClp: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  reminderOptIn: boolean;
  serviceName: string;
  staffName: string;
  businessName: string;
  businessSlug: string;
  businessAddress: string;
  businessPhone: string;
  timezone: string;
};

// `tag` identifica el tipo de correo en los logs (nunca se registra el asunto: puede llevar el nombre del cliente).
export type EmailContent = { subject: string; html: string; text: string; tag?: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** «martes 27 de octubre, 10:30 h» en la zona del negocio. */
export function formatWhen(iso: string, timezone: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("es-CL", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("es-CL", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${day.replace(",", "")}, ${time} h`;
}

const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

// ─── Piezas del diseño ───

const C = {
  page: "#f7f6f2", card: "#ffffff", soft: "#fbfaf7", ink: "#18191c", ink2: "#4a4d52", muted: "#656972",
  line: "#e3e1da", brand: "#2f3a56",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

type Tone = "brand" | "success" | "warning" | "danger";
const TONES: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: "#eceef4", fg: C.brand },
  success: { bg: "#eaf4ed", fg: "#216a3c" },
  warning: { bg: "#fdf6e6", fg: "#7a5a1e" },
  danger: { bg: "#fdf2f0", fg: "#b3392a" },
};

type Shell = {
  siteUrl: string;
  /** Texto de vista previa que muestran las bandejas junto al asunto (ya escapado o constante). */
  preheader: string;
  badge: { label: string; tone: Tone };
  title: string;
  /** HTML (los valores variables deben venir escapados). */
  intro: string;
  body: string;
  /** HTML bajo la tarjeta (datos del local). */
  footer?: string;
  /** Dominio visible en el pie (por defecto, el de siteUrl). */
  host?: string;
};

/** Marco común: ícono y marca, tarjeta con franja de color, etiqueta, título, contenido y pie. */
function shell(s: Shell): string {
  const tone = TONES[s.badge.tone];
  const site = escapeHtml(s.siteUrl);
  const host = escapeHtml(s.host ?? s.siteUrl.replace(/^https?:\/\//, ""));
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(s.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${s.preheader}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 12px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 18px;">
      <a href="${site}" style="text-decoration:none;color:${C.brand};">
        <img src="${LOGO_URL}" width="32" height="32" alt="AuraBook"
          style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;">
        <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:17px;font-weight:800;letter-spacing:-.01em;color:${C.brand};">AuraBook</span>
      </a>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:20px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="height:6px;line-height:6px;font-size:0;background:${C.brand};border-radius:20px 20px 0 0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 30px 6px;">
          <span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${tone.bg};color:${tone.fg};font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(s.badge.label)}</span>
          <h1 style="margin:16px 0 8px;font-size:25px;line-height:1.25;font-weight:800;letter-spacing:-.02em;color:${C.ink};">${escapeHtml(s.title)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:${C.ink2};">${s.intro}</p>
        </td></tr>
        <tr><td style="padding:22px 30px 30px;">${s.body}</td></tr>
      </table>
    </td></tr>
    ${s.footer ? `<tr><td style="padding:20px 8px 0;font-size:13px;line-height:1.6;color:${C.muted};text-align:center;">${s.footer}</td></tr>` : ""}
    <tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:${C.muted};text-align:center;">
      Reservas con <a href="${site}" style="color:${C.muted};font-weight:700;text-decoration:none;">AuraBook</a> · ${host}
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/** Tarjeta de la cita: hoja de calendario (mes, día, día de la semana) + horario, servicio y profesional. */
function ticket(b: Pick<BookingEmailData, "startAt" | "endAt" | "timezone" | "serviceName" | "staffName">, cancelled = false): string {
  const part = (iso: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-CL", { timeZone: b.timezone, ...o }).format(new Date(iso));
  const hm = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
  const month = part(b.startAt, { month: "short" }).replace(".", "").toUpperCase();
  const tile = cancelled ? "#9a9da3" : C.brand;
  const strike = cancelled ? "text-decoration:line-through;" : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border:1px solid ${C.line};border-radius:16px;">
<tr>
  <td width="88" valign="top" style="padding:16px 0 16px 16px;">
    <table role="presentation" width="72" cellpadding="0" cellspacing="0" style="background:${tile};border-radius:14px;">
      <tr><td align="center" style="padding:9px 0 11px;color:#ffffff;">
        <div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#d9dce6;">${escapeHtml(month)}</div>
        <div style="font-size:30px;line-height:1.1;font-weight:800;color:#ffffff;">${escapeHtml(part(b.startAt, { day: "numeric" }))}</div>
        <div style="font-size:11px;font-weight:600;color:#d9dce6;">${escapeHtml(part(b.startAt, { weekday: "long" }))}</div>
      </td></tr>
    </table>
  </td>
  <td valign="middle" style="padding:16px 18px;">
    <div style="font-size:21px;line-height:1.2;font-weight:800;letter-spacing:-.01em;color:${C.ink};${strike}">${escapeHtml(part(b.startAt, hm))} – ${escapeHtml(part(b.endAt, hm))} h</div>
    <div style="margin-top:6px;font-size:15px;font-weight:700;color:${C.ink};">${escapeHtml(b.serviceName)}</div>
    <div style="margin-top:2px;font-size:13px;color:${C.muted};">con ${escapeHtml(b.staffName)}</div>
  </td>
</tr>
</table>`;
}

/** Filas etiqueta/valor. `href` opcional convierte el valor en enlace (teléfono, correo). */
function details(rows: { label: string; value: string; href?: string }[]): string {
  if (rows.length === 0) return "";
  const cells = rows.map((r, i) => {
    const border = i === rows.length - 1 ? "" : `border-bottom:1px solid #eeece5;`;
    const value = r.href
      ? `<a href="${escapeHtml(r.href)}" style="color:${C.brand};text-decoration:none;">${escapeHtml(r.value)}</a>`
      : escapeHtml(r.value);
    return `<tr>
  <td style="padding:11px 0;${border}font-size:13px;color:${C.muted};">${escapeHtml(r.label)}</td>
  <td style="padding:11px 0;${border}font-size:14px;font-weight:700;color:${C.ink};text-align:right;">${value}</td>
</tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">${cells}</table>`;
}

/** Botones a lo ancho, uno bajo otro (se leen bien en el celular). El primero es el principal. */
function buttons(list: { label: string; href: string }[]): string {
  return list.map((btn, i) => {
    const primary = i === 0;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${primary ? 22 : 10}px;">
<tr><td align="center" style="border-radius:12px;background:${primary ? C.brand : C.card};${primary ? "" : `border:1px solid ${C.line};`}">
  <a href="${escapeHtml(btn.href)}" style="display:block;padding:14px 18px;font-size:15px;font-weight:700;color:${primary ? "#ffffff" : C.ink};text-decoration:none;border-radius:12px;">${escapeHtml(btn.label)}</a>
</td></tr>
</table>`;
  }).join("");
}

/** Recuadro de aviso (recordatorio, hora liberada, etc.). `html` ya escapado o constante. */
function note(html: string, tone: Tone = "brand"): string {
  const t = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
<tr><td style="padding:13px 15px;border-radius:12px;background:${t.bg};color:${t.fg};font-size:13px;line-height:1.55;font-weight:600;">${html}</td></tr>
</table>`;
}

/** Pie con los datos del local, para que el cliente sepa a quién escribir. */
function businessFooter(b: Pick<BookingEmailData, "businessName" | "businessAddress" | "businessPhone">): string {
  const lines = [`<strong style="color:${C.ink2};">${escapeHtml(b.businessName)}</strong>`];
  if (b.businessAddress) lines.push(escapeHtml(b.businessAddress));
  if (b.businessPhone) {
    lines.push(`<a href="tel:${escapeHtml(b.businessPhone.replace(/[^\d+]/g, ""))}" style="color:${C.muted};">${escapeHtml(b.businessPhone)}</a>`);
  }
  return lines.join("<br>");
}

function text(title: string, rows: [string, string][], extra = ""): string {
  return [title, "", ...rows.map(([k, v]) => `${k}: ${v}`), extra ? `\n${extra}` : ""].join("\n").trim();
}

const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

/** Enlace para agregar la cita a Google Calendar (las fechas van en UTC). */
function googleCalendarUrl(b: BookingEmailData, manage: string): string {
  const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.serviceName} · ${b.businessName}`,
    dates: `${utc(b.startAt)}/${utc(b.endAt)}`,
    details: `Ver o cancelar tu reserva: ${manage}`,
    ...(b.businessAddress ? { location: b.businessAddress } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ─── Correos al negocio ───

/** Aviso al dueño: llegó una reserva nueva desde la página pública. */
export function ownerNewBookingEmail(b: BookingEmailData, siteUrl: string): EmailContent {
  const when = formatWhen(b.startAt, b.timezone);
  const rows: [string, string][] = [
    ["Cliente", b.clientName],
    ["Teléfono", b.clientPhone],
    ...(b.clientEmail ? [["Correo", b.clientEmail] as [string, string]] : []),
    ["Servicio", b.serviceName],
    ["Profesional", b.staffName],
    ["Fecha", when],
    ["Valor", clp(b.priceClp)],
  ];
  const title = "Nueva reserva";
  return {
    tag: "owner_new_booking",
    subject: `Nueva reserva: ${b.clientName} · ${when}`,
    html: shell({
      siteUrl,
      preheader: `${escapeHtml(b.clientName)} reservó ${escapeHtml(b.serviceName)} para el ${escapeHtml(when)}.`,
      badge: { label: "Nueva reserva", tone: "success" },
      title: "Tienes una nueva reserva",
      intro: `<strong style="color:${C.ink};">${escapeHtml(b.clientName)}</strong> reservó en <strong style="color:${C.ink};">${escapeHtml(b.businessName)}</strong>.`,
      body: ticket(b) + details([
        { label: "Cliente", value: b.clientName },
        { label: "Teléfono", value: b.clientPhone, href: `tel:${b.clientPhone.replace(/[^\d+]/g, "")}` },
        ...(b.clientEmail ? [{ label: "Correo", value: b.clientEmail, href: `mailto:${b.clientEmail}` }] : []),
        { label: "Valor", value: clp(b.priceClp) },
      ]) + buttons([
        { label: "Ver mi agenda", href: `${siteUrl}/dashboard` },
        { label: "Escribirle por WhatsApp", href: whatsappUrl(b.clientPhone) },
      ]),
    }),
    text: text(`${title} en ${b.businessName}`, rows, `Agenda: ${siteUrl}/dashboard`),
  };
}

/** Aviso al dueño: un cliente canceló su reserva desde su enlace. La hora vuelve a estar disponible. */
export function ownerCancellationEmail(b: BookingEmailData, siteUrl: string): EmailContent {
  const when = formatWhen(b.startAt, b.timezone);
  const rows: [string, string][] = [
    ["Cliente", b.clientName],
    ["Teléfono", b.clientPhone],
    ["Servicio", b.serviceName],
    ["Profesional", b.staffName],
    ["Fecha", when],
  ];
  const title = "Reserva cancelada";
  const freed = "La hora quedó libre otra vez en tu página de reservas.";
  return {
    tag: "owner_cancellation",
    subject: `Cancelación: ${b.clientName} · ${when}`,
    html: shell({
      siteUrl,
      preheader: `${escapeHtml(b.clientName)} canceló su hora del ${escapeHtml(when)}. ${freed}`,
      badge: { label: "Cancelada", tone: "danger" },
      title: "Se canceló una reserva",
      intro: `<strong style="color:${C.ink};">${escapeHtml(b.clientName)}</strong> canceló su reserva en <strong style="color:${C.ink};">${escapeHtml(b.businessName)}</strong>.`,
      body: ticket(b, true) + details([
        { label: "Cliente", value: b.clientName },
        { label: "Teléfono", value: b.clientPhone, href: `tel:${b.clientPhone.replace(/[^\d+]/g, "")}` },
      ]) + note(`✓ ${escapeHtml(freed)}`, "success") + buttons([{ label: "Ver mi agenda", href: `${siteUrl}/dashboard` }]),
    }),
    text: text(`${title} en ${b.businessName}`, rows, `${freed}\nAgenda: ${siteUrl}/dashboard`),
  };
}

// ─── Correos al cliente ───

/** Confirmación al cliente (solo si dejó su correo). */
export function clientConfirmationEmail(b: BookingEmailData, siteUrl: string): EmailContent {
  const when = formatWhen(b.startAt, b.timezone);
  const manage = `${siteUrl}/reserva/${b.manageToken}`;
  const rows: [string, string][] = [
    ["Servicio", b.serviceName],
    ["Profesional", b.staffName],
    ["Fecha", when],
    ...(b.businessAddress ? [["Dirección", b.businessAddress] as [string, string]] : []),
    ["Total en el local", clp(b.priceClp)],
  ];
  const reminder = b.reminderOptIn
    ? "Te enviaremos un recordatorio el día antes de tu cita."
    : "Si no puedes asistir, cancela desde el enlace para liberar la hora.";
  return {
    tag: "client_confirmation",
    subject: `Reserva confirmada en ${b.businessName} · ${when}`,
    html: shell({
      siteUrl,
      preheader: `${escapeHtml(b.serviceName)} con ${escapeHtml(b.staffName)}, ${escapeHtml(when)}.`,
      badge: { label: "Reserva confirmada", tone: "success" },
      title: "¡Tu hora está reservada!",
      intro: `Hola ${escapeHtml(b.clientName)}, te esperamos en <strong style="color:${C.ink};">${escapeHtml(b.businessName)}</strong>.`,
      body: ticket(b) + details([
        ...(b.businessAddress ? [{ label: "Dirección", value: b.businessAddress, href: mapsUrl(b.businessAddress) }] : []),
        { label: "Total en el local", value: clp(b.priceClp) },
      ]) + note(escapeHtml(reminder)) + buttons([
        { label: "Ver o cancelar mi reserva", href: manage },
        { label: "Agregar a Google Calendar", href: googleCalendarUrl(b, manage) },
        ...(b.businessAddress ? [{ label: "Cómo llegar", href: mapsUrl(b.businessAddress) }] : []),
      ]),
      footer: businessFooter(b),
    }),
    text: text(`Reserva confirmada en ${b.businessName}`, rows, `${reminder}\nVer o cancelar: ${manage}`),
  };
}

/** Recordatorio del día antes (solo si el cliente lo pidió). */
export function clientReminderEmail(b: BookingEmailData, siteUrl: string): EmailContent {
  const when = formatWhen(b.startAt, b.timezone);
  const manage = `${siteUrl}/reserva/${b.manageToken}`;
  const rows: [string, string][] = [
    ["Servicio", b.serviceName],
    ["Profesional", b.staffName],
    ["Fecha", when],
    ...(b.businessAddress ? [["Dirección", b.businessAddress] as [string, string]] : []),
    ...(b.businessPhone ? [["Teléfono del local", b.businessPhone] as [string, string]] : []),
  ];
  return {
    tag: "client_reminder",
    subject: `Recordatorio: mañana tienes hora en ${b.businessName}`,
    html: shell({
      siteUrl,
      preheader: `Mañana: ${escapeHtml(b.serviceName)} con ${escapeHtml(b.staffName)} en ${escapeHtml(b.businessName)}.`,
      badge: { label: "Recordatorio", tone: "warning" },
      title: "Te esperamos mañana",
      intro: `Hola ${escapeHtml(b.clientName)}, te recordamos tu cita en <strong style="color:${C.ink};">${escapeHtml(b.businessName)}</strong>.`,
      body: ticket(b) + details([
        ...(b.businessAddress ? [{ label: "Dirección", value: b.businessAddress, href: mapsUrl(b.businessAddress) }] : []),
        ...(b.businessPhone
          ? [{ label: "Teléfono del local", value: b.businessPhone, href: `tel:${b.businessPhone.replace(/[^\d+]/g, "")}` }]
          : []),
      ]) + note("¿No puedes asistir? Cancela desde el enlace para que otra persona pueda tomar la hora.", "warning") + buttons([
        ...(b.businessAddress ? [{ label: "Cómo llegar", href: mapsUrl(b.businessAddress) }] : []),
        { label: "Ver o cancelar mi reserva", href: manage },
      ]),
      footer: businessFooter(b),
    }),
    text: text(`Recordatorio: mañana tienes hora en ${b.businessName}`, rows, `Ver o cancelar: ${manage}`),
  };
}

// ─── Avisos internos a Clikium ───

/** Aviso interno a Clikium: un negocio informó que transfirió para contratar Premium. */
export function paymentRequestEmail(r: {
  businessName: string; businessSlug: string; ownerEmail: string; period: "monthly" | "yearly"; extraStaff: number;
  amountClp: number; reference: string;
}, siteUrl: string): EmailContent {
  const rows: [string, string][] = [
    ["Negocio", `${r.businessName} (/${r.businessSlug})`],
    ["Correo", r.ownerEmail || "—"],
    ["Plan", `Premium ${r.period === "yearly" ? "anual" : "mensual"}`],
    ["Profesionales adicionales", String(r.extraStaff)],
    ["Monto", clp(r.amountClp)],
    ["N° de operación", r.reference || "—"],
  ];
  const title = "Transferencia por revisar";
  return {
    tag: "payment_request",
    subject: `Premium por transferencia: ${r.businessName} · ${clp(r.amountClp)}`,
    html: shell({
      siteUrl,
      preheader: `${escapeHtml(r.businessName)} informó una transferencia de ${escapeHtml(clp(r.amountClp))}.`,
      badge: { label: "Pago por revisar", tone: "warning" },
      title,
      intro: "Un negocio informó que transfirió para contratar Premium. Revisa la cuenta y aprueba o rechaza la solicitud.",
      body: details(rows.map(([label, value]) => ({ label, value })))
        + buttons([{ label: "Revisar en /admin", href: `${siteUrl}/admin` }]),
    }),
    text: text(title, rows, `Revisar: ${siteUrl}/admin`),
  };
}

/** Aviso interno a Clikium: un negocio terminó la configuración y publicó su página por primera vez. */
export function businessPublishedEmail(r: {
  businessName: string; businessSlug: string; category: string; ownerEmail: string;
}, siteUrl: string): EmailContent {
  const page = `${siteUrl}/reservar/${r.businessSlug}`;
  const rows: [string, string][] = [
    ["Negocio", r.businessName],
    ["Rubro", r.category],
    ["Página", `/reservar/${r.businessSlug}`],
    ["Dueño", r.ownerEmail || "—"],
  ];
  const title = "Negocio nuevo publicado";
  return {
    tag: "business_published",
    subject: `Nuevo negocio en AuraBook: ${r.businessName}`,
    html: shell({
      siteUrl,
      preheader: `${escapeHtml(r.businessName)} (${escapeHtml(r.category)}) ya tiene su página de reservas.`,
      badge: { label: "Negocio nuevo", tone: "success" },
      title,
      intro: "Un negocio terminó la configuración y su página de reservas ya está visible.",
      body: details(rows.map(([label, value]) => ({ label, value })))
        + buttons([{ label: "Ver su página", href: page }, { label: "Abrir /admin", href: `${siteUrl}/admin` }]),
    }),
    text: text(title, rows, `Página: ${page}\nAdmin: ${siteUrl}/admin`),
  };
}

/** Correo de prueba de /admin → Ajustes. */
export function adminTestEmail(from: string, siteUrl: string): EmailContent {
  const intro = "Si recibes este correo, los avisos de AuraBook (nuevas reservas, cancelaciones y recordatorios) se están enviando bien.";
  return {
    tag: "admin_test",
    subject: "Prueba de correo · AuraBook",
    html: shell({
      siteUrl,
      preheader: "Los correos de AuraBook están funcionando.",
      badge: { label: "Prueba", tone: "brand" },
      title: "Los correos funcionan ✓",
      intro: escapeHtml(intro),
      body: details([{ label: "Remitente", value: from }, { label: "Sitio", value: siteUrl.replace(/^https?:\/\//, "") }])
        + buttons([{ label: "Volver a /admin", href: `${siteUrl}/admin` }]),
    }),
    text: intro,
  };
}

// ─── Plantillas de Supabase Auth ───

/**
 * HTML para las plantillas de correo de Supabase Auth (confirmar cuenta, restablecer contraseña…), con el mismo diseño.
 * Recibe textos constantes y variables de plantilla de Supabase ({{ .SiteURL }}, {{ .TokenHash }}, {{ .Email }}),
 * por eso `intro` y `foot` son HTML de confianza. Lo usa scripts/build-auth-emails.mjs.
 */
export function authEmailHtml(o: {
  siteUrl: string; preheader: string; badge: string; title: string; intro: string;
  button?: { label: string; href: string }; foot: string;
}): string {
  const body = (o.button ? buttons([o.button]) + `
<p style="margin:22px 0 6px;font-size:12px;line-height:1.5;color:${C.muted};">Si el botón no funciona, copia este enlace en tu navegador:</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${C.ink2};word-break:break-all;">${escapeHtml(o.button.href)}</p>` : "")
    + note(o.foot);
  return shell({ siteUrl: o.siteUrl, host: "aurabook.cl", preheader: o.preheader, badge: { label: o.badge, tone: "brand" }, title: o.title, intro: o.intro, body });
}
