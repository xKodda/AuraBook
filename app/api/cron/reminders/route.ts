import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/env";
import { sendDueReminders } from "@/lib/email";
import { privilegedDb } from "@/lib/supabase";
import { safeError } from "@/lib/log-safe";

export const dynamic = "force-dynamic";

// Vercel Cron llama a esta ruta una vez al día (vercel.json) con `Authorization: Bearer <CRON_SECRET>`.
// Además de los recordatorios, borra los registros de limitación de intentos (contienen IP) de más de 1 día
// (la Política de Privacidad compromete eliminarlos dentro de 48 horas) y registra las pruebas y planes vencidos
// (subscription_events), sin depender de que el negocio abra la app.
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (DEMO_MODE) return NextResponse.json({ skipped: "demo" });
  try {
    const cutoff = new Date(Date.now() - 86_400_000).toISOString();
    const { error: purgeError } = await privilegedDb().from("rate_limits").delete().lt("window_start", cutoff);
    if (purgeError) console.error("purge rate_limits:", purgeError.message);
    const { data: expirations, error: expError } = await privilegedDb().rpc("record_subscription_expirations");
    if (expError) console.error("record_subscription_expirations:", expError.message);
    const result = await sendDueReminders();
    console.log("Recordatorios:", result, "· vencimientos registrados:", expirations ?? 0);
    return NextResponse.json({ ...result, expirations: expirations ?? 0 });
  } catch (error) {
    console.error("cron reminders:", safeError(error));
    return NextResponse.json({ error: "Error al enviar recordatorios" }, { status: 500 });
  }
}
