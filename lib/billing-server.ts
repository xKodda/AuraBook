import "server-only";
import { DEMO_MODE } from "./env";
import { demoAdminSnapshot, demoBusinessSubscription } from "./demo-billing";
import { sessionDb } from "./supabase";
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
      endsAt: row.status === "trial" ? row.trial_ends_at : row.paid_until,
    });
  }
  return result;
}
