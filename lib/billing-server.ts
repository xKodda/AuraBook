import "server-only";
import { DEMO_MODE } from "./env";
import { demoAdminSnapshot, demoBusinessSubscription } from "./demo-billing";
import { DEFAULT_PUBLIC_PLANS, type Entitlements, type FeatureKey, type PlanTier, type PublicPlans } from "./plans";
import { publicDb, sessionDb } from "./supabase";
import type { AdminSnapshot, BillingSummary, BusinessSubscription, SubscriptionStatus } from "./types";

export async function isPlatformAdmin(): Promise<boolean> {
  if (DEMO_MODE) return true;
  const db = await sessionDb();
  const { data, error } = await db.rpc("is_platform_admin");
  if (error) {
    // Ante cualquier error, se niega el acceso (y el panel del negocio sigue funcionando).
    console.error("is_platform_admin:", error.message);
    return false;
  }
  return data === true;
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  if (DEMO_MODE) return demoAdminSnapshot();
  const db = await sessionDb();
  const { data, error } = await db.rpc("admin_snapshot");
  if (error) throw new Error(error.message);
  return data as AdminSnapshot;
}

/** null si el negocio no existe o el usuario no es owner/admin. */
export async function getBusinessSubscription(businessId: string): Promise<BusinessSubscription | null> {
  if (DEMO_MODE) return demoBusinessSubscription();
  const db = await sessionDb();
  const { data, error } = await db.rpc("get_business_subscription", { p_business_id: businessId });
  if (error) {
    if (error.message.includes("FORBIDDEN")) return null;
    throw new Error(error.message);
  }
  return (data as BusinessSubscription | null) ?? null;
}

/** Estado de suscripción de los negocios donde el usuario es owner/admin (para avisos). */
export async function mySubscriptions(): Promise<Map<string, BillingSummary>> {
  const result = new Map<string, BillingSummary>();
  if (DEMO_MODE) return result;
  const db = await sessionDb();
  const { data, error } = await db.rpc("my_subscriptions");
  if (error) {
    console.error("my_subscriptions:", error.message);
    return result;
  }
  for (const row of (data ?? []) as {
    business_id: string; status: SubscriptionStatus; trial_ends_at: string; paid_until: string | null;
  }[]) {
    result.set(row.business_id, {
      status: row.status,
      // Vencido sin pagos: la fecha relevante es el fin de la prueba.
      endsAt: row.status === "trial" ? row.trial_ends_at : (row.paid_until ?? row.trial_ends_at),
    });
  }
  return result;
}

/** Capacidades del plan vigente de cada negocio del usuario (cualquier rol). Ante un error, se asume Free. */
export async function myEntitlements(): Promise<Map<string, Entitlements>> {
  const result = new Map<string, Entitlements>();
  if (DEMO_MODE) return result;
  const db = await sessionDb();
  const { data, error } = await db.rpc("my_entitlements");
  if (error) {
    console.error("my_entitlements:", error.message);
    return result;
  }
  for (const row of (data ?? []) as {
    business_id: string; tier: PlanTier; max_staff: number | null; features: FeatureKey[]; staff_count: number;
  }[]) {
    result.set(row.business_id, { tier: row.tier, maxStaff: row.max_staff, features: row.features ?? [], staffCount: row.staff_count });
  }
  return result;
}

/** Planes publicados para /precios. Si la base de datos no responde, se usan los valores de lib/plans.ts. */
export async function getPublicPlans(): Promise<PublicPlans> {
  if (DEMO_MODE) return DEFAULT_PUBLIC_PLANS;
  const { data, error } = await publicDb().rpc("public_plans");
  if (error || !data) {
    console.error("public_plans:", error?.message);
    return DEFAULT_PUBLIC_PLANS;
  }
  const plans = data as PublicPlans;
  return plans.plans.length ? plans : DEFAULT_PUBLIC_PLANS;
}
