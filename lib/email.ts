import "server-only";
import { PUBLIC_ORIGIN } from "./env";
import { redact, safeError } from "./log-safe";
import {
  clientConfirmationEmail, clientReminderEmail, ownerCancellationEmail, ownerNewBookingEmail,
  type BookingEmailData, type EmailContent,
} from "./email-templates";
import { pushToBookingTeam } from "./push";
import { cancellationPush, newBookingPush } from "./push-messages";
import { privilegedDb } from "./supabase";

// Remitente: dominio verificado en Resend (aurabook.cl). EMAIL_FROM permite cambiarlo sin tocar el código.
const FROM = process.env.EMAIL_FROM || "AuraBook <no-reply@aurabook.cl>";

/** Para /admin: si el envío de correos está configurado y con qué remitente. */
export const EMAIL_STATUS = { configured: Boolean(process.env.RESEND_API_KEY), from: FROM };

/** Envía un correo con la API de Resend. Sin RESEND_API_KEY no envía (y lo registra). */
export async function sendEmail(to: string | string[], content: EmailContent, replyTo?: string): Promise<boolean> {
  return (await sendEmailDetailed(to, content, replyTo)).ok;
}

/** Igual que sendEmail, pero devuelve el motivo si falla (para el correo de prueba de /admin). */
export async function sendEmailDetailed(
  to: string | string[], content: EmailContent, replyTo?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!key) {
    console.warn(`Correo no enviado (${content.tag ?? "sin etiqueta"}): falta RESEND_API_KEY`);
    return { ok: false, error: "Falta la variable RESEND_API_KEY en el servidor (Vercel)." };
  }
  if (recipients.length === 0) {
    console.warn(`Correo no enviado (${content.tag ?? "sin etiqueta"}): sin destinatarios`);
    return { ok: false, error: "No hay destinatarios." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: recipients, subject: content.subject, html: content.html, text: content.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // La respuesta de Resend puede repetir direcciones: se redacta antes de registrarla o mostrarla en /admin.
      const detail = redact(await res.text());
      console.error(`Resend ${res.status} (${content.tag ?? "sin etiqueta"}): ${detail}`);
      return { ok: false, error: `Resend respondió ${res.status}: ${detail}` };
    }
    return { ok: true };
  } catch (error) {
    console.error(`Resend sin respuesta (${content.tag ?? "sin etiqueta"}): ${safeError(error)}`);
    return { ok: false, error: "No se pudo conectar con Resend." };
  }
}

type Notification = BookingEmailData & { ownerEmails: string[] };

async function loadNotification(bookingId: string): Promise<Notification | null> {
  const { data, error } = await privilegedDb().rpc("booking_notification", { p_booking_id: bookingId });
  if (error) {
    console.error("booking_notification:", error.message);
    return null;
  }
  return (data as Notification | null) ?? null;
}

const siteUrl = () => PUBLIC_ORIGIN;

/** Tras una reserva pública: aviso a los dueños (correo y push) y, si dejó correo, confirmación al cliente. */
export async function notifyNewBooking(bookingId: string): Promise<void> {
  const n = await loadNotification(bookingId);
  if (!n) {
    console.error("notifyNewBooking: sin datos para la reserva", bookingId);
    return;
  }
  const withoutOwner = n.ownerEmails.length === 0;
  if (withoutOwner) console.warn("notifyNewBooking: el negocio no tiene dueño con correo", n.businessSlug);
  await Promise.all([
    sendEmail(n.ownerEmails, ownerNewBookingEmail(n, siteUrl()), n.clientEmail ?? undefined),
    n.clientEmail ? sendEmail(n.clientEmail, clientConfirmationEmail(n, siteUrl())) : Promise.resolve(false),
    pushToBookingTeam(bookingId, newBookingPush(bookingId, n)),
  ]);
}

/** El cliente canceló desde su enlace: aviso a los dueños (correo y push) para que sepan que la hora quedó libre. */
export async function notifyClientCancellation(bookingId: string): Promise<void> {
  const n = await loadNotification(bookingId);
  if (!n) return;
  await Promise.all([
    sendEmail(n.ownerEmails, ownerCancellationEmail(n, siteUrl()), n.clientEmail ?? undefined),
    pushToBookingTeam(bookingId, cancellationPush(bookingId, n)),
  ]);
}

/** Envía los recordatorios de mañana. Cada uno se reclama antes de enviarlo (sin duplicados). */
export async function sendDueReminders(): Promise<{ due: number; sent: number; failed: number }> {
  const db = privilegedDb();
  const { data, error } = await db.rpc("due_reminders");
  if (error) throw new Error(`due_reminders: ${error.message}`);
  const ids = ((data ?? []) as (string | { due_reminders: string })[])
    .map((row) => (typeof row === "string" ? row : row.due_reminders));
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const { data: claimed } = await db.rpc("claim_reminder", { p_booking_id: id });
    if (claimed !== true) continue;
    const n = await loadNotification(id);
    const ok = Boolean(n?.clientEmail) && await sendEmail(n!.clientEmail!, clientReminderEmail(n!, siteUrl()));
    if (ok) sent++;
    else {
      failed++;
      await db.rpc("release_reminder", { p_booking_id: id });
    }
  }
  return { due: ids.length, sent, failed };
}
