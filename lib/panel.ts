import "server-only";
import {
  DEMO_MODE, DEMO_BUSINESSES, demoCatalog, demoCreatePanelBooking, demoListBookings, demoPanelBusinesses, demoRevenue, demoSetStatus,
} from "./demo";
import { myEntitlements, mySubscriptions } from "./billing-server";
import { FREE_ENTITLEMENTS, type Entitlements } from "./plans";
import { addCalendarDays, dateInTimeZone, timeInTimeZone, zonedTimeToUtc } from "./dates";
import { sessionDb } from "./supabase";
import type {
  BookingStatus, BusinessCategory, BusinessRole, PanelBooking, PanelBookingInput, PanelBusiness, PanelCatalog, RevenueDay,
} from "./types";

export type PanelSession = {
  userId: string;
  email: string | null;
  businesses: PanelBusiness[];
  demo: boolean;
};

type DbMembership = {
  role: BusinessRole;
  businesses: {
    id: string; slug: string; name: string; category: BusinessCategory; brand_color: string; timezone: string;
    is_active: boolean; logo_url: string | null;
  } | null;
};

export { canManageSettings, canManageStaff, canViewAllBookings } from "./permissions";

/** null = sin sesión. Una sesión con `businesses` vacío = usuario sin acceso a ningún negocio. */
export async function getPanelSession(): Promise<PanelSession | null> {
  if (DEMO_MODE) {
    const businesses = demoPanelBusinesses().map((b, i) => (
      i === 0 ? { ...b, billing: { status: "active" as const, endsAt: new Date(Date.now() + 4 * 86_400_000).toISOString() } } : b
    ));
    return { userId: "demo", email: null, businesses, demo: true };
  }
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data, error } = await db
    .from("business_members")
    .select("role, businesses(id,slug,name,category,brand_color,timezone,is_active,logo_url)")
    .eq("user_id", user.id);
  if (error) throw new Error(`No se pudieron cargar los negocios: ${error.message}`);
  const [billing, entitlements] = await Promise.all([mySubscriptions(), myEntitlements()]);
  const businesses = ((data ?? []) as unknown as DbMembership[])
    .filter((m) => m.businesses)
    .map((m) => ({
      id: m.businesses!.id,
      slug: m.businesses!.slug,
      name: m.businesses!.name,
      category: m.businesses!.category,
      brandColor: m.businesses!.brand_color,
      timezone: m.businesses!.timezone,
      role: m.role,
      published: m.businesses!.is_active,
      logoUrl: m.businesses!.logo_url,
      billing: billing.get(m.businesses!.id),
      entitlements: entitlements.get(m.businesses!.id) ?? FREE_ENTITLEMENTS,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { userId: user.id, email: user.email ?? null, businesses, demo: false };
}

export async function listPanelStaff(businessId: string): Promise<{ id: string; name: string }[]> {
  if (DEMO_MODE) {
    return DEMO_BUSINESSES.find((b) => b.id === businessId)?.staff.map(({ id, name }) => ({ id, name })) ?? [];
  }
  const db = await sessionDb();
  const { data, error } = await db.from("staff").select("id,name")
    .eq("business_id", businessId).eq("is_active", true).order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

type DbPanelBooking = {
  id: string;
  staff_id: string;
  client_name: string;
  client_phone: string;
  price_clp: number;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  source: "web" | "panel";
  is_overbook: boolean;
  services: { name: string } | null;
  staff: { name: string } | null;
};

/** Agenda del día en la zona horaria del negocio. RLS limita lo que ve cada rol. */
export function listPanelBookings(business: PanelBusiness, date: string): Promise<PanelBooking[]> {
  return listPanelBookingsRange(business, date, date);
}

/** Reservas entre dos fechas locales (ambas incluidas), para la vista semanal. Máximo 31 días. */
export async function listPanelBookingsRange(business: PanelBusiness, fromDate: string, toDate: string): Promise<PanelBooking[]> {
  if (DEMO_MODE) {
    const days: PanelBooking[] = [];
    for (let d = fromDate; d <= toDate; d = addCalendarDays(d, 1)) days.push(...demoListBookings(business.id, d));
    return days;
  }
  const from = zonedTimeToUtc(fromDate, "00:00", business.timezone).toISOString();
  const to = zonedTimeToUtc(addCalendarDays(toDate, 1), "00:00", business.timezone).toISOString();
  const db = await sessionDb();
  const { data, error } = await db
    .from("bookings")
    .select("id,staff_id,client_name,client_phone,price_clp,start_at,end_at,status,source,is_overbook,services(name),staff(name)")
    .eq("business_id", business.id)
    .gte("start_at", from)
    .lt("start_at", to)
    .order("start_at");
  if (error) throw new Error(`No se pudo cargar la agenda: ${error.message}`);
  return ((data ?? []) as unknown as DbPanelBooking[]).map((b) => ({
    id: b.id,
    date: dateInTimeZone(new Date(b.start_at), business.timezone),
    staffId: b.staff_id,
    staffName: b.staff?.name ?? "—",
    serviceName: b.services?.name ?? "—",
    clientName: b.client_name,
    clientPhone: b.client_phone,
    priceClp: b.price_clp,
    startTime: timeInTimeZone(new Date(b.start_at), business.timezone),
    endTime: timeInTimeZone(new Date(b.end_at), business.timezone),
    status: b.status,
    source: b.source,
    overbook: b.is_overbook,
  }));
}

export type SetStatusResult = "OK" | "FORBIDDEN" | "SLOT_TAKEN" | "ERROR";

export async function setPanelBookingStatus(
  businessId: string, bookingId: string, status: BookingStatus,
): Promise<SetStatusResult> {
  if (DEMO_MODE) {
    const r = demoSetStatus(businessId, bookingId, status);
    return r === "NOT_FOUND" ? "FORBIDDEN" : r;
  }
  const db = await sessionDb();
  const { error } = await db.rpc("panel_set_booking_status", { p_booking_id: bookingId, p_status: status });
  if (!error) return "OK";
  if (error.message.includes("SLOT_TAKEN")) return "SLOT_TAKEN";
  if (error.message.includes("FORBIDDEN")) return "FORBIDDEN";
  console.error("setPanelBookingStatus:", error.message);
  return "ERROR";
}

/** Ingresos por día entre `from` y `to` (fechas locales, ambos incluidos). RLS: un profesional ve solo lo suyo. */
export async function getPanelRevenue(business: PanelBusiness, from: string, to: string): Promise<RevenueDay[]> {
  if (DEMO_MODE) return demoRevenue(business.id, from, to);
  const db = await sessionDb();
  const { data, error } = await db.rpc("panel_revenue", { p_business_id: business.id, p_from: from, p_to: to });
  if (error) throw new Error(`No se pudieron calcular los ingresos: ${error.message}`);
  return ((data ?? []) as { day: string; total_clp: number | string; bookings: number }[])
    .map((d) => ({ day: d.day, totalClp: Number(d.total_clp), bookings: d.bookings }));
}

/** Servicios activos con quién los atiende, y el equipo activo, para agendar desde el panel. */
export async function getPanelCatalog(businessId: string): Promise<PanelCatalog> {
  if (DEMO_MODE) return demoCatalog(businessId);
  const db = await sessionDb();
  const [servicesRes, eligibilityRes, staff] = await Promise.all([
    db.from("services").select("id,name,duration_min,price_clp").eq("business_id", businessId).eq("is_active", true).order("sort_order"),
    db.from("staff_services").select("staff_id,service_id").eq("business_id", businessId),
    listPanelStaff(businessId),
  ]);
  if (servicesRes.error) throw new Error(servicesRes.error.message);
  if (eligibilityRes.error) throw new Error(eligibilityRes.error.message);
  const active = new Set(staff.map((m) => m.id));
  const eligibility = ((eligibilityRes.data ?? []) as { staff_id: string; service_id: string }[]).filter((e) => active.has(e.staff_id));
  return {
    staff,
    services: ((servicesRes.data ?? []) as { id: string; name: string; duration_min: number; price_clp: number }[]).map((sv) => ({
      id: sv.id, name: sv.name, durationMin: sv.duration_min, priceClp: sv.price_clp,
      staffIds: eligibility.filter((e) => e.service_id === sv.id).map((e) => e.staff_id),
    })),
  };
}

export type CreatePanelBookingResult =
  | "OK" | "FORBIDDEN" | "SLOT_TAKEN" | "INVALID_PHONE" | "INVALID_NAME" | "SERVICE_NOT_FOUND" | "STAFF_NOT_FOUND" | "ERROR";

/** Reserva agregada por el equipo. Con `overbook`, se guarda aunque choque con otra (queda marcada). */
export async function createPanelBooking(business: PanelBusiness, input: PanelBookingInput): Promise<CreatePanelBookingResult> {
  if (DEMO_MODE) return demoCreatePanelBooking(business.id, input);
  const db = await sessionDb();
  const { error } = await db.rpc("panel_create_booking", {
    p_business_id: business.id,
    p_service_id: input.serviceId,
    p_staff_id: input.staffId,
    p_client_name: input.name,
    p_client_phone: input.phone,
    p_start_at: zonedTimeToUtc(input.date, input.time, business.timezone).toISOString(),
    p_notes: input.notes || null,
    p_overbook: input.overbook,
  });
  if (!error) return "OK";
  const known = ["FORBIDDEN", "SLOT_TAKEN", "INVALID_PHONE", "INVALID_NAME", "SERVICE_NOT_FOUND", "STAFF_NOT_FOUND"] as const;
  const code = known.find((k) => error.message.includes(k));
  if (code) return code;
  console.error("createPanelBooking:", error.message);
  return "ERROR";
}
