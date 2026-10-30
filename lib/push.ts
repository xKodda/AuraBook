import "server-only";
import webpush from "web-push";
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "./env";
import { safeError } from "./log-safe";
import type { PushMessage } from "./push-messages";
import { privilegedDb } from "./supabase";

/** Para /admin y el panel: si los avisos push están configurados (las dos claves VAPID). */
export const PUSH_STATUS = {
  configured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
  partial: Boolean(VAPID_PUBLIC_KEY) !== Boolean(VAPID_PRIVATE_KEY),
};

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
type SendResult = "ok" | "gone" | "failed";

/**
 * Envía un aviso a un navegador. Nunca lanza ni registra el contenido (lleva el nombre del cliente).
 * "gone": el servicio de push respondió 404/410 porque el navegador anuló la suscripción (desinstaló, borró datos o
 * revocó el permiso); no es un error nuestro.
 */
export async function sendPush(target: PushTarget, message: PushMessage): Promise<SendResult> {
  if (!PUSH_STATUS.configured) {
    if (PUSH_STATUS.partial) console.warn("Push no enviado: falta una de las claves VAPID");
    return "failed";
  }
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      {
        vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY },
        TTL: 60 * 60 * 24,
        urgency: "high",
        timeout: 10_000,
      },
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error(`Push ${status ?? "sin respuesta"} (${new URL(target.endpoint).host})`);
    return "failed";
  }
}

/** Aviso a los navegadores de los dueños y administradores del negocio de la reserva. Un push fallido no afecta la reserva. */
export async function pushToBookingTeam(bookingId: string, message: PushMessage): Promise<{ sent: number; failed: number }> {
  if (!PUSH_STATUS.configured) return { sent: 0, failed: 0 };
  const db = privilegedDb();
  const { data, error } = await db.rpc("booking_push_targets", { p_booking_id: bookingId });
  if (error) {
    console.error(`booking_push_targets: ${safeError(error)}`);
    return { sent: 0, failed: 0 };
  }
  const rows = (data ?? []) as { endpoint: string; p256dh: string; auth_secret: string }[];
  const results = await Promise.all(rows.map(async (row) => {
    const result = await sendPush({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth_secret }, message);
    const { error: recordError } = await db.rpc("record_push_result", {
      p_endpoint: row.endpoint, p_ok: result === "ok", p_gone: result === "gone",
    });
    if (recordError) console.error(`record_push_result: ${safeError(recordError)}`);
    return result;
  }));
  return { sent: results.filter((r) => r === "ok").length, failed: results.filter((r) => r === "failed").length };
}
