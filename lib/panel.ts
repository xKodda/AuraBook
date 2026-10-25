import "server-only";
import { DEMO_MODE, DEMO_BUSINESSES, demoListBookings, demoPanelBusinesses, demoSetStatus } from "./demo";
import { mySubscriptions } from "./billing-server";
import { addCalendarDays, timeInTimeZone, zonedTimeToUtc } from "./dates";
import { sessionDb } from "./supabase";
import type { BookingStatus, BusinessCategory, BusinessRole, PanelBooking, PanelBusiness } from "./types";

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
  const billing = await mySubscriptions();
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
  services: { name: string } | null;
  staff: { name: string } | null;
};

/** Agenda del día en la zona horaria del negocio. RLS limita lo que ve cada rol. */
export async function listPanelBookings(business: PanelBusiness, date: string): Promise<PanelBooking[]> {
  if (DEMO_MODE) return demoListBookings(business.id, date);
  const from = zonedTimeToUtc(date, "00:00", business.timezone).toISOString();
  const to = zonedTimeToUtc(addCalendarDays(date, 1), "00:00", business.timezone).toISOString();
  const db = await sessionDb();
  const { data, error } = await db
    .from("bookings")
    .select("id,staff_id,client_name,client_phone,price_clp,start_at,end_at,status,source,services(name),staff(name)")
    .eq("business_id", business.id)
    .gte("start_at", from)
    .lt("start_at", to)
    .order("start_at");
  if (error) throw new Error(`No se pudo cargar la agenda: ${error.message}`);
  return ((data ?? []) as unknown as DbPanelBooking[]).map((b) => ({
    id: b.id,
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
