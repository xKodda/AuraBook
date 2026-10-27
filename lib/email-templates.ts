// Correos transaccionales de reservas. Funciones puras: reciben datos y devuelven asunto + HTML + texto.
// Todo valor que viene del cliente o del negocio se escapa (un nombre podría traer HTML).

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

export type EmailContent = { subject: string; html: string; text: string };

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

function layout(title: string, intro: string, rows: [string, string][], button?: { label: string; href: string }, foot?: string): string {
  const rowsHtml = rows.map(([k, v]) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #eeece5;font-size:13px;color:#656972;">${escapeHtml(k)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #eeece5;font-size:13px;font-weight:700;color:#18191c;text-align:right;">${escapeHtml(v)}</td>
    </tr>`).join("");
  const buttonHtml = button ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr>
      <td style="border-radius:8px;background:#2f3a56;">
        <a href="${escapeHtml(button.href)}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(button.label)}</a>
      </td>
    </tr></table>` : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f7f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18191c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:28px 14px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e1da;border-radius:16px;"><tr><td style="padding:28px;">
    <p style="margin:0 0 20px;font-size:12px;font-weight:800;letter-spacing:.08em;">AURA<span style="color:#2f3a56;">BOOK</span></p>
    <h1 style="margin:0 0 8px;font-size:21px;line-height:1.3;font-weight:800;">${escapeHtml(title)}</h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#4a4d52;">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
    ${buttonHtml}
    ${foot ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#656972;">${foot}</p>` : ""}
  </td></tr></table>
  <p style="margin:14px 0 0;font-size:11px;color:#656972;">Reservas con AuraBook · Clikium</p>
</td></tr></table></body></html>`;
}

function text(title: string, rows: [string, string][], extra = ""): string {
  return [title, "", ...rows.map(([k, v]) => `${k}: ${v}`), extra ? `\n${extra}` : ""].join("\n").trim();
}

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
    subject: `Nueva reserva: ${b.clientName} · ${when}`,
    html: layout(title, `Recibiste una reserva en <strong>${escapeHtml(b.businessName)}</strong>.`, rows,
      { label: "Ver mi agenda", href: `${siteUrl}/dashboard` }),
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
  const note = "La hora quedó libre otra vez en tu página de reservas.";
  return {
    subject: `Cancelación: ${b.clientName} · ${when}`,
    html: layout(title, `${escapeHtml(b.clientName)} canceló su reserva en <strong>${escapeHtml(b.businessName)}</strong>.`, rows,
      { label: "Ver mi agenda", href: `${siteUrl}/dashboard` }, escapeHtml(note)),
    text: text(`${title} en ${b.businessName}`, rows, `${note}\nAgenda: ${siteUrl}/dashboard`),
  };
}

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
    subject: `Reserva confirmada en ${b.businessName} · ${when}`,
    html: layout("¡Tu hora está reservada!", `Hola ${escapeHtml(b.clientName)}, tu cita en <strong>${escapeHtml(b.businessName)}</strong> quedó confirmada.`,
      rows, { label: "Ver o cancelar mi reserva", href: manage }, escapeHtml(reminder)),
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
    subject: `Recordatorio: mañana tienes hora en ${b.businessName}`,
    html: layout("Te esperamos mañana", `Hola ${escapeHtml(b.clientName)}, te recordamos tu cita en <strong>${escapeHtml(b.businessName)}</strong>.`,
      rows, { label: "Ver o cancelar mi reserva", href: manage }, "Si no puedes asistir, cancela desde el enlace para que otra persona pueda tomar la hora."),
    text: text(`Recordatorio: mañana tienes hora en ${b.businessName}`, rows, `Ver o cancelar: ${manage}`),
  };
}
