"use server";

// Endpoints públicos: se valida la entrada aquí y la BD exige platform_admin en cada RPC.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isPlatformAdmin } from "@/lib/billing-server";
import { sendEmailDetailed } from "@/lib/email";
import { DEMO_MODE } from "@/lib/env";
import { rpcErrorMessage } from "@/lib/errors";
import { sessionDb } from "@/lib/supabase";

export type AdminResult = { ok: true } | { ok: false; error: string };

const id = z.uuid();
const INVALID: AdminResult = { ok: false, error: "Revisa los datos ingresados." };
const DEMO: AdminResult = { ok: false, error: "Modo demo: los cambios no se guardan. Conecta Supabase para operar." };

async function call(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  if (DEMO_MODE) return DEMO;
  const db = await sessionDb();
  const { error } = await db.rpc(fn, args);
  if (error) {
    console.error(`${fn}:`, error.message);
    return { ok: false, error: rpcErrorMessage(error.message) };
  }
  revalidatePath("/admin");
  return { ok: true };
}

const planSchema = z.object({
  id: id.nullable(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(""),
  priceClp: z.number().int().min(0).max(10_000_000),
  maxStaff: z.number().int().min(1).max(500).nullable(),
  isActive: z.boolean(),
});

export async function savePlanAction(input: unknown): Promise<AdminResult> {
  const p = planSchema.safeParse(input);
  if (!p.success) return INVALID;
  return call("admin_save_plan", {
    p_plan_id: p.data.id, p_name: p.data.name, p_description: p.data.description,
    p_price_clp: p.data.priceClp, p_max_staff: p.data.maxStaff, p_is_active: p.data.isActive,
  });
}

export async function setBusinessPlanAction(businessId: string, planId: string | null): Promise<AdminResult> {
  if (!id.safeParse(businessId).success || (planId !== null && !id.safeParse(planId).success)) return INVALID;
  return call("admin_set_business_plan", { p_business_id: businessId, p_plan_id: planId });
}

const paymentSchema = z.object({
  businessId: id,
  planId: id,
  amountClp: z.number().int().min(0).max(100_000_000),
  months: z.number().int().min(1).max(24),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["transferencia", "efectivo", "tarjeta", "otro"]),
  reference: z.string().trim().max(120).default(""),
});

export async function recordPaymentAction(input: unknown): Promise<AdminResult> {
  const p = paymentSchema.safeParse(input);
  if (!p.success) return INVALID;
  return call("admin_record_payment", {
    p_business_id: p.data.businessId, p_plan_id: p.data.planId, p_amount_clp: p.data.amountClp,
    p_months: p.data.months, p_paid_at: p.data.paidAt, p_method: p.data.method, p_reference: p.data.reference,
  });
}

export async function extendTrialAction(businessId: string, days: number): Promise<AdminResult> {
  if (!id.safeParse(businessId).success || !Number.isInteger(days) || days < 1 || days > 365) return INVALID;
  return call("admin_extend_trial", { p_business_id: businessId, p_days: days });
}

export async function setCancelledAction(businessId: string, cancelled: boolean, notes: string): Promise<AdminResult> {
  if (!id.safeParse(businessId).success || typeof cancelled !== "boolean" || typeof notes !== "string" || notes.length > 1000) {
    return INVALID;
  }
  return call("admin_set_cancelled", { p_business_id: businessId, p_cancelled: cancelled, p_notes: notes });
}

export async function updateSettingsAction(trialDays: number): Promise<AdminResult> {
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) return INVALID;
  return call("admin_update_settings", { p_trial_days: trialDays });
}

/** Aprueba (registra el pago y activa Premium) o rechaza una transferencia informada desde «Contratar Premium». */
export async function resolvePaymentRequestAction(requestId: string, approve: boolean): Promise<AdminResult> {
  if (!id.safeParse(requestId).success || typeof approve !== "boolean") return INVALID;
  return call("admin_resolve_payment_request", { p_request_id: requestId, p_approve: approve });
}

/** Envía un correo de prueba al administrador para comprobar la configuración de Resend (muestra el error exacto). */
export async function sendTestEmailAction(): Promise<AdminResult> {
  if (DEMO_MODE) return DEMO;
  if (!(await isPlatformAdmin())) return { ok: false, error: rpcErrorMessage("FORBIDDEN") };
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) return { ok: false, error: rpcErrorMessage("UNAUTHENTICATED") };
  const result = await sendEmailDetailed(user.email, {
    tag: "admin_test", subject: "Prueba de correo · AuraBook",
    text: "Si recibes este correo, los avisos de AuraBook (nuevas reservas, cancelaciones y recordatorios) se están enviando bien.",
    html: "<p>Si recibes este correo, los avisos de AuraBook (nuevas reservas, cancelaciones y recordatorios) se están enviando bien.</p>",
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
