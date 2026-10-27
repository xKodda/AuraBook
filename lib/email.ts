import "server-only";
import { SITE_URL } from "./env";
import {
  clientConfirmationEmail, clientReminderEmail, ownerCancellationEmail, ownerNewBookingEmail,
  type BookingEmailData, type EmailContent,
} from "./email-templates";
import { privilegedDb } from "./supabase";

const FROM = process.env.EMAIL_FROM || "AuraBook <no-reply@aurabook.clikium.cl>";

/** Envía un correo con la API de Resend. Sin RESEND_API_KEY no envía (y lo registra). */
export async function sendEmail(to: string | string[], content: EmailContent, replyTo?: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!key) {
    console.warn("RESEND_API_KEY no configurada: correo no enviado:", content.subject);
    return false;
  }
  if (recipients.length === 0) return false;
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
      console.error("Resend", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend error:", error);
    return false;
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

const siteUrl = () => SITE_URL || "https://aurabook.clikium.cl";

/** Tras una reserva pública: aviso a los dueños y, si dejó correo, confirmación al cliente. */
export async function notifyNewBooking(bookingId: string): Promise<void> {
  const n = await loadNotification(bookingId);
  if (!n) return;
  await Promise.all([
    sendEmail(n.ownerEmails, ownerNewBookingEmail(n, siteUrl()), n.clientEmail ?? undefined),
    n.clientEmail ? sendEmail(n.clientEmail, clientConfirmationEmail(n, siteUrl())) : Promise.resolve(false),
  ]);
}

/** El cliente canceló desde su enlace: aviso a los dueños para que sepan que la hora quedó libre. */
export async function notifyClientCancellation(bookingId: string): Promise<void> {
  const n = await loadNotification(bookingId);
  if (!n) return;
  await sendEmail(n.ownerEmails, ownerCancellationEmail(n, siteUrl()), n.clientEmail ?? undefined);
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
