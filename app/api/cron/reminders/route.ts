import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/env";
import { sendDueReminders } from "@/lib/email";

export const dynamic = "force-dynamic";

// Vercel Cron llama a esta ruta una vez al día (vercel.json) con `Authorization: Bearer <CRON_SECRET>`.
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
    const result = await sendDueReminders();
    console.log("Recordatorios:", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("cron reminders:", error);
    return NextResponse.json({ error: "Error al enviar recordatorios" }, { status: 500 });
  }
}
