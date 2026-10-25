import "server-only";
import { sessionDb } from "./supabase";
import type { BusinessCategory, OnboardingState, ScheduleDay } from "./types";

type DbMembership = {
  business_id: string;
  role: string;
  staff_id: string | null;
  businesses: { is_active: boolean; created_at: string } | null;
};

/** Negocio propio sin publicar más antiguo: el que el onboarding debe retomar. */
export async function findPendingBusinessId(userId: string): Promise<string | null> {
  const db = await sessionDb();
  const { data, error } = await db
    .from("business_members")
    .select("business_id, role, staff_id, businesses(is_active, created_at)")
    .eq("user_id", userId)
    .eq("role", "owner");
  if (error) throw new Error(`No se pudieron cargar los negocios: ${error.message}`);
  const pending = ((data ?? []) as unknown as DbMembership[])
    .filter((m) => m.businesses && !m.businesses.is_active)
    .sort((a, b) => a.businesses!.created_at.localeCompare(b.businesses!.created_at));
  return pending[0]?.business_id ?? null;
}

export async function hasAnyMembership(userId: string): Promise<boolean> {
  const db = await sessionDb();
  const { count, error } = await db
    .from("business_members")
    .select("business_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/**
 * Estado completo del onboarding de un negocio, leído con la sesión del usuario.
 * RLS garantiza que solo se obtiene si el usuario es miembro; si no, devuelve `business: null`.
 */
export async function getOnboardingState(businessId: string, userId: string): Promise<OnboardingState> {
  const empty: OnboardingState = { business: null, staff: [], services: [], schedules: {} };
  const db = await sessionDb();
  const { data: b, error } = await db
    .from("businesses")
    .select("id,slug,name,category,tagline,description,address,phone,brand_color,logo_url,is_active")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!b) return empty;

  const [staffRes, servicesRes, eligibilityRes, hoursRes, breaksRes, memberRes] = await Promise.all([
    db.from("staff").select("id,name,role_title").eq("business_id", businessId).eq("is_active", true).order("sort_order"),
    db.from("services").select("id,name,description,price_clp,duration_min")
      .eq("business_id", businessId).eq("is_active", true).order("sort_order"),
    db.from("staff_services").select("staff_id,service_id").eq("business_id", businessId),
    db.from("working_hours").select("staff_id,weekday,opens_at,closes_at").eq("business_id", businessId),
    db.from("staff_breaks").select("staff_id,weekday,starts_at,ends_at").eq("business_id", businessId),
    db.from("business_members").select("staff_id").eq("business_id", businessId).eq("user_id", userId).maybeSingle(),
  ]);
  for (const res of [staffRes, servicesRes, eligibilityRes, hoursRes, breaksRes, memberRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const myStaffId = (memberRes.data as { staff_id: string | null } | null)?.staff_id ?? null;
  const activeStaff = new Set(((staffRes.data ?? []) as { id: string }[]).map((s) => s.id));
  // Se ignoran habilitaciones y horarios de profesionales archivados.
  const eligibility = ((eligibilityRes.data ?? []) as { staff_id: string; service_id: string }[])
    .filter((e) => activeStaff.has(e.staff_id));
  const breaks = (breaksRes.data ?? []) as { staff_id: string; weekday: number; starts_at: string; ends_at: string }[];

  const schedules: Record<string, ScheduleDay[]> = {};
  for (const h of (hoursRes.data ?? []) as { staff_id: string; weekday: number; opens_at: string; closes_at: string }[]) {
    const br = breaks.find((x) => x.staff_id === h.staff_id && x.weekday === h.weekday);
    (schedules[h.staff_id] ??= []).push({
      weekday: h.weekday,
      opens: hhmm(h.opens_at)!,
      closes: hhmm(h.closes_at)!,
      breakStart: hhmm(br?.starts_at ?? null),
      breakEnd: hhmm(br?.ends_at ?? null),
    });
  }
  for (const days of Object.values(schedules)) days.sort((x, y) => x.weekday - y.weekday);

  const row = b as {
    id: string; slug: string; name: string; category: BusinessCategory; tagline: string | null;
    description: string | null; address: string | null; phone: string | null; is_active: boolean;
    brand_color: string; logo_url: string | null;
  };
  return {
    business: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      tagline: row.tagline ?? "",
      description: row.description ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
      brandColor: row.brand_color,
      logoUrl: row.logo_url,
      published: row.is_active,
    },
    staff: ((staffRes.data ?? []) as { id: string; name: string; role_title: string | null }[]).map((s) => ({
      id: s.id, name: s.name, roleTitle: s.role_title ?? "", linkedToMe: s.id === myStaffId,
    })),
    services: ((servicesRes.data ?? []) as {
      id: string; name: string; description: string | null; price_clp: number; duration_min: number;
    }[]).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      priceClp: s.price_clp,
      durationMin: s.duration_min,
      staffIds: eligibility.filter((e) => e.service_id === s.id).map((e) => e.staff_id),
    })),
    schedules,
  };
}
