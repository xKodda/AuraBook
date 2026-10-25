"use server";

// Cada acción es un endpoint público: se valida la entrada aquí y la autorización la impone la BD
// (las RPC verifican rol con auth.uid()). Devuelven el estado actualizado para refrescar el asistente.

import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/env";
import { rpcErrorMessage } from "@/lib/errors";
import { getOnboardingState } from "@/lib/onboarding";
import { sessionDb } from "@/lib/supabase";
import type { OnboardingState } from "@/lib/types";

export type OnboardingResult = { ok: true; state: OnboardingState } | { ok: false; error: string };

const CATEGORIES = ["barberia", "peluqueria", "unas", "spa", "estetica", "otro"] as const;
const id = z.uuid();
const optionalText = (max: number) => z.string().trim().max(max).default("");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(CATEGORIES),
  tagline: optionalText(160),
  description: optionalText(600),
  address: optionalText(200),
  phone: optionalText(20),
});

const createSchema = profileSchema.extend({ slug: z.string().trim().toLowerCase().min(3).max(60) });

const staffSchema = z.object({
  id: id.nullable(),
  name: z.string().trim().min(2).max(120),
  roleTitle: optionalText(60),
  linkToMe: z.boolean(),
});

const serviceSchema = z.object({
  id: id.nullable(),
  name: z.string().trim().min(2).max(120),
  description: optionalText(300),
  priceClp: z.number().int().min(0).max(10_000_000),
  durationMin: z.number().int().min(15).max(480).multipleOf(15),
  staffIds: z.array(id).min(1).max(50),
});

const scheduleSchema = z.object({
  staffIds: z.array(id).min(1).max(50),
  days: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    opens: time,
    closes: time,
    breakStart: time.nullable(),
    breakEnd: time.nullable(),
  })).max(7),
});

const INVALID: OnboardingResult = { ok: false, error: "Revisa los datos ingresados." };
const DEMO: OnboardingResult = { ok: false, error: "El onboarding requiere Supabase configurado (modo demo activo)." };
const SESSION_EXPIRED: OnboardingResult = { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

/** Ejecuta una RPC con la sesión del usuario y devuelve el estado fresco del negocio. */
async function mutate(
  businessId: string | ((data: unknown) => string),
  rpc: (db: Awaited<ReturnType<typeof sessionDb>>) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<OnboardingResult> {
  if (DEMO_MODE) return DEMO;
  const user = await currentUser();
  if (!user) return SESSION_EXPIRED;
  const db = await sessionDb();
  const { data, error } = await rpc(db);
  if (error) {
    console.error("onboarding rpc:", error.message);
    return { ok: false, error: rpcErrorMessage(error.message) };
  }
  const target = typeof businessId === "function" ? businessId(data) : businessId;
  return { ok: true, state: await getOnboardingState(target, user.id) };
}

export async function createBusinessAction(input: unknown): Promise<OnboardingResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const p = parsed.data;
  const created = await mutate(
    (data) => (data as { business_id: string }[])[0].business_id,
    (db) => db.rpc("create_business_with_owner", {
      p_name: p.name, p_slug: p.slug, p_category: p.category,
      p_tagline: p.tagline, p_address: p.address, p_phone: p.phone,
    }),
  );
  // La descripción no está en la firma de creación: se guarda después. Si eso fallara, el negocio
  // ya existe y se devuelve igual para que el asistente continúe.
  if (!created.ok || !p.description || !created.state.business) return created;
  const updated = await updateBusinessAction(created.state.business.id, p);
  return updated.ok ? updated : created;
}

export async function updateBusinessAction(businessId: string, input: unknown): Promise<OnboardingResult> {
  const parsed = profileSchema.safeParse(input);
  if (!id.safeParse(businessId).success || !parsed.success) return INVALID;
  const p = parsed.data;
  return mutate(businessId, (db) => db.rpc("update_business_profile", {
    p_business_id: businessId, p_name: p.name, p_category: p.category, p_tagline: p.tagline,
    p_description: p.description, p_address: p.address, p_phone: p.phone,
  }));
}

export async function saveStaffAction(businessId: string, input: unknown): Promise<OnboardingResult> {
  const parsed = staffSchema.safeParse(input);
  if (!id.safeParse(businessId).success || !parsed.success) return INVALID;
  const s = parsed.data;
  return mutate(businessId, (db) => db.rpc("save_staff", {
    p_business_id: businessId, p_staff_id: s.id, p_name: s.name, p_role_title: s.roleTitle, p_link_to_me: s.linkToMe,
  }));
}

export async function archiveStaffAction(businessId: string, staffId: string): Promise<OnboardingResult> {
  if (!id.safeParse(businessId).success || !id.safeParse(staffId).success) return INVALID;
  return mutate(businessId, (db) => db.rpc("archive_staff", { p_business_id: businessId, p_staff_id: staffId }));
}

export async function saveScheduleAction(businessId: string, input: unknown): Promise<OnboardingResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!id.safeParse(businessId).success || !parsed.success) return INVALID;
  const days = parsed.data.days.map((d) => ({
    weekday: d.weekday, opens: d.opens, closes: d.closes, break_start: d.breakStart, break_end: d.breakEnd,
  }));
  return mutate(businessId, (db) => db.rpc("set_weekly_schedule", {
    p_business_id: businessId, p_staff_ids: parsed.data.staffIds, p_days: days,
  }));
}

export async function saveServiceAction(businessId: string, input: unknown): Promise<OnboardingResult> {
  const parsed = serviceSchema.safeParse(input);
  if (!id.safeParse(businessId).success || !parsed.success) return INVALID;
  const s = parsed.data;
  return mutate(businessId, (db) => db.rpc("save_service", {
    p_business_id: businessId, p_service_id: s.id, p_name: s.name, p_description: s.description,
    p_price_clp: s.priceClp, p_duration_min: s.durationMin, p_staff_ids: s.staffIds,
  }));
}

export async function archiveServiceAction(businessId: string, serviceId: string): Promise<OnboardingResult> {
  if (!id.safeParse(businessId).success || !id.safeParse(serviceId).success) return INVALID;
  return mutate(businessId, (db) => db.rpc("archive_service", { p_business_id: businessId, p_service_id: serviceId }));
}

export async function publishBusinessAction(businessId: string): Promise<OnboardingResult> {
  if (!id.safeParse(businessId).success) return INVALID;
  return mutate(businessId, (db) => db.rpc("complete_onboarding", { p_business_id: businessId }));
}

export async function checkSlugAction(slug: string): Promise<boolean | null> {
  if (DEMO_MODE || typeof slug !== "string" || slug.length > 60) return null;
  const db = await sessionDb();
  const { data, error } = await db.rpc("slug_available", { p_slug: slug });
  return error ? null : data === true;
}
