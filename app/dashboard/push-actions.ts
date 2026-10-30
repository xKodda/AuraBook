"use server";

// Activar o desactivar los avisos push en este navegador. La BD asocia la suscripción a auth.uid():
// un usuario no puede guardar ni borrar suscripciones de otro.

import { headers } from "next/headers";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/env";
import { safeError } from "@/lib/log-safe";
import { sendPush } from "@/lib/push";
import { TEST_PUSH } from "@/lib/push-messages";
import { rateLimit } from "@/lib/rate-limit";
import { sessionDb } from "@/lib/supabase";

export type PushResult = { ok: true } | { ok: false; error: string };

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }),
});

const DEMO: PushResult = { ok: false, error: "En el modo demo no se activan avisos reales." };
const EXPIRED: PushResult = { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
const FAILED: PushResult = { ok: false, error: "No pudimos guardar los avisos. Intenta nuevamente." };

export async function savePushSubscriptionAction(input: unknown): Promise<PushResult> {
  if (DEMO_MODE) return DEMO;
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Este navegador entregó una suscripción no válida." };
  if (!(await currentUser())) return EXPIRED;
  const userAgent = (await headers()).get("user-agent") ?? "";
  const db = await sessionDb();
  const { error } = await db.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint, p_p256dh: parsed.data.keys.p256dh, p_auth: parsed.data.keys.auth, p_user_agent: userAgent,
  });
  if (error) {
    console.error(`save_push_subscription: ${safeError(error)}`);
    return FAILED;
  }
  return { ok: true };
}

/** Aviso de prueba a este mismo navegador (lo usa el botón «Probar»). Va directo a su suscripción, sin pasar por la BD. */
export async function sendTestPushAction(input: unknown): Promise<PushResult> {
  if (DEMO_MODE) return DEMO;
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Este navegador entregó una suscripción no válida." };
  const user = await currentUser();
  if (!user) return EXPIRED;
  if (!(await rateLimit(`push-test:user:${user.id}`, 5, 600))) {
    return { ok: false, error: "Ya enviamos varios avisos de prueba. Espera unos minutos." };
  }
  const result = await sendPush({ endpoint: parsed.data.endpoint, ...parsed.data.keys }, TEST_PUSH);
  return result === "ok" ? { ok: true } : { ok: false, error: "El aviso de prueba no salió. Desactiva y vuelve a activar los avisos." };
}

export async function deletePushSubscriptionAction(endpoint: unknown): Promise<PushResult> {
  if (DEMO_MODE) return DEMO;
  const parsed = z.url().max(1000).safeParse(endpoint);
  if (!parsed.success) return { ok: true };
  if (!(await currentUser())) return EXPIRED;
  const db = await sessionDb();
  const { error } = await db.rpc("delete_push_subscription", { p_endpoint: parsed.data });
  if (error) {
    console.error(`delete_push_subscription: ${safeError(error)}`);
    return FAILED;
  }
  return { ok: true };
}
