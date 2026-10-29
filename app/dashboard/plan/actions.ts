"use server";

// Contratar Premium por transferencia. El monto lo calcula la base de datos (premium_quote) y la solicitud NO activa
// Premium: Clikium la aprueba en /admin cuando confirma la transferencia (migración 20261110000000).

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/dashboard";
import { sendEmail } from "@/lib/email";
import { paymentRequestEmail } from "@/lib/email-templates";
import { BILLING_NOTIFY_EMAIL, DEMO_MODE, PUBLIC_ORIGIN } from "@/lib/env";
import { rpcErrorMessage } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { sessionDb } from "@/lib/supabase";

export type CheckoutResult = { ok: true; amountClp: number } | { ok: false; error: string };

const schema = z.object({
  period: z.enum(["monthly", "yearly"]),
  extraStaff: z.number().int().min(0).max(100),
  reference: z.string().trim().max(120),
});

async function managed() {
  const ctx = await getDashboardContext();
  return ctx && ctx.business.role !== "staff" ? ctx : null;
}

export async function requestPremiumAction(input: unknown): Promise<CheckoutResult> {
  if (DEMO_MODE) return { ok: false, error: "En el modo demo no se envían solicitudes de pago." };
  const ctx = await managed();
  if (!ctx) return { ok: false, error: rpcErrorMessage("FORBIDDEN") };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: rpcErrorMessage("INVALID_PAYMENT_REQUEST") };
  const { period, extraStaff, reference } = parsed.data;
  if (!(await rateLimit(`payment-request:user:${ctx.session.userId}`, 5, 3600))) {
    return { ok: false, error: "Demasiados intentos. Espera un rato o escríbenos a contacto@clikium.cl." };
  }

  const db = await sessionDb();
  const { data, error } = await db.rpc("create_payment_request", {
    p_business_id: ctx.business.id, p_period: period, p_extra: extraStaff, p_reference: reference || null,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message) };
  const amountClp = (data as { amountClp: number }).amountClp;

  // Aviso a Clikium para revisar la transferencia (después de responder).
  const business = ctx.business;
  const ownerEmail = ctx.session.email ?? "";
  after(() => sendEmail(BILLING_NOTIFY_EMAIL, paymentRequestEmail({
    businessName: business.name, businessSlug: business.slug, ownerEmail, period, extraStaff, amountClp, reference,
  }, PUBLIC_ORIGIN), ownerEmail || undefined));

  revalidatePath("/dashboard/plan");
  return { ok: true, amountClp };
}

export async function cancelPremiumRequestAction(): Promise<CheckoutResult> {
  if (DEMO_MODE) return { ok: false, error: "En el modo demo no se envían solicitudes de pago." };
  const ctx = await managed();
  if (!ctx) return { ok: false, error: rpcErrorMessage("FORBIDDEN") };
  const db = await sessionDb();
  const { error } = await db.rpc("cancel_payment_request", { p_business_id: ctx.business.id });
  if (error) return { ok: false, error: rpcErrorMessage(error.message) };
  revalidatePath("/dashboard/plan");
  return { ok: true, amountClp: 0 };
}
