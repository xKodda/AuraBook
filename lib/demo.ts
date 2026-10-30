import "server-only";
import type {
  AvailableSlot, BookingPayload, BookingStatus, BookingSuccess, Business, CancelResult,
  ManagedBooking, OnboardingState, PanelBooking, PanelBookingInput, PanelBusiness, PanelCatalog, RevenueDay, ScheduleDay,
} from "./types";
import type { FeatureKey } from "./plans";
import {
  addCalendarDays, dateInTimeZone, dateWithinBookingWindow, formatMinutes, minutes,
  timeInTimeZone, weekdayOf, zonedTimeToUtc,
} from "./dates";

export { DEMO_MODE } from "./env";

// ─────────────────────────────────────────────────────────────
// Catálogo demo: tres rubros distintos para validar el white-label.
// IDs fijos para coincidir con supabase/seed.sql.
// ─────────────────────────────────────────────────────────────
const TZ = "America/Santiago";
const MIN_NOTICE_MIN = 30;
const MAX_ACTIVE_PER_PHONE = 3;

type Schedule = { days: number[]; open: string; close: string; breaks: Array<[string, string]> };

const SCHEDULES: Record<string, Schedule> = {
  // Barber Studio
  "55555555-5555-4555-8555-555555555555": { days: [1, 2, 3, 4, 5, 6], open: "10:00", close: "20:00", breaks: [["14:00", "15:00"]] },
  "66666666-6666-4666-8666-666666666666": { days: [2, 3, 4, 5, 6], open: "11:00", close: "19:00", breaks: [["14:00", "15:00"]] },
  // Aura Nails
  "a2000000-0000-4000-8000-000000000001": { days: [1, 2, 3, 4, 5, 6], open: "10:00", close: "19:00", breaks: [["13:30", "14:30"]] },
  "a2000000-0000-4000-8000-000000000002": { days: [2, 3, 4, 5, 6], open: "11:00", close: "20:00", breaks: [["15:00", "15:30"]] },
  // Salón Lumière
  "a3000000-0000-4000-8000-000000000001": { days: [1, 2, 3, 4, 5, 6], open: "10:00", close: "19:00", breaks: [["14:00", "15:00"]] },
  "a3000000-0000-4000-8000-000000000002": { days: [1, 2, 3, 4, 5], open: "10:00", close: "18:00", breaks: [["13:00", "14:00"]] },
};

export const DEMO_BUSINESSES: Omit<Business, "features">[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "barber-studio",
    name: "Barber Studio",
    category: "barberia",
    tagline: "Tu estilo, a tu ritmo.",
    address: "Av. Italia 1450, Providencia",
    phone: "+56 9 1111 2222",
    timezone: TZ,
    brandColor: "#9A6B3F",
    logoUrl: null,
    maxDaysAhead: 30,
    cancelNoticeMin: 120,
    services: [
      { id: "22222222-2222-4222-8222-222222222222", name: "Corte clásico", description: "Corte y terminaciones de precisión", durationMin: 30, priceClp: 12000 },
      { id: "33333333-3333-4333-8333-333333333333", name: "Corte + barba", description: "Experiencia completa para tu estilo", durationMin: 45, priceClp: 17000 },
      { id: "44444444-4444-4444-8444-444444444444", name: "Perfilado de barba", description: "Líneas limpias y definición", durationMin: 30, priceClp: 8000 },
    ],
    staff: [
      { id: "55555555-5555-4555-8555-555555555555", name: "Carlos", roleTitle: "Barbero senior", avatarUrl: null, serviceIds: ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"] },
      { id: "66666666-6666-4666-8666-666666666666", name: "Matías", roleTitle: "Barbero", avatarUrl: null, serviceIds: ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"] },
    ],
  },
  {
    id: "a2000000-0000-4000-8000-000000000000",
    slug: "aura-nails",
    name: "Aura Nails Studio",
    category: "unas",
    tagline: "Manos impecables, sin apuros.",
    address: "Nueva Costanera 3800, Vitacura",
    phone: "+56 9 3333 4444",
    timezone: TZ,
    brandColor: "#B4577A",
    logoUrl: null,
    maxDaysAhead: 45,
    cancelNoticeMin: 240,
    services: [
      { id: "a2100000-0000-4000-8000-000000000001", name: "Manicure semipermanente", description: "Esmaltado de larga duración y cutícula", durationMin: 60, priceClp: 18000 },
      { id: "a2100000-0000-4000-8000-000000000002", name: "Pedicure spa", description: "Exfoliación, hidratación y esmaltado", durationMin: 75, priceClp: 22000 },
      { id: "a2100000-0000-4000-8000-000000000003", name: "Uñas acrílicas", description: "Set completo con diseño a elección", durationMin: 120, priceClp: 32000 },
      { id: "a2100000-0000-4000-8000-000000000004", name: "Retiro + manicure express", description: "Retiro seguro y limado", durationMin: 45, priceClp: 12000 },
    ],
    staff: [
      { id: "a2000000-0000-4000-8000-000000000001", name: "Valentina", roleTitle: "Manicurista", avatarUrl: null, serviceIds: ["a2100000-0000-4000-8000-000000000001", "a2100000-0000-4000-8000-000000000002", "a2100000-0000-4000-8000-000000000004"] },
      { id: "a2000000-0000-4000-8000-000000000002", name: "Fernanda", roleTitle: "Nail artist", avatarUrl: null, serviceIds: ["a2100000-0000-4000-8000-000000000001", "a2100000-0000-4000-8000-000000000003", "a2100000-0000-4000-8000-000000000004"] },
    ],
  },
  {
    id: "a3000000-0000-4000-8000-000000000000",
    slug: "salon-lumiere",
    name: "Salón Lumière",
    category: "peluqueria",
    tagline: "Color, corte y brillo propio.",
    address: "José Victorino Lastarria 90, Santiago",
    phone: "+56 9 5555 6666",
    timezone: TZ,
    brandColor: "#4F5D95",
    logoUrl: null,
    maxDaysAhead: 60,
    cancelNoticeMin: 1440,
    services: [
      { id: "a3100000-0000-4000-8000-000000000001", name: "Corte y brushing", description: "Diagnóstico, lavado, corte y peinado", durationMin: 60, priceClp: 25000 },
      { id: "a3100000-0000-4000-8000-000000000002", name: "Coloración completa", description: "Tinte raíz a puntas con tratamiento", durationMin: 120, priceClp: 55000 },
      { id: "a3100000-0000-4000-8000-000000000003", name: "Balayage", description: "Iluminación a mano alzada + matiz", durationMin: 180, priceClp: 85000 },
      { id: "a3100000-0000-4000-8000-000000000004", name: "Peinado para evento", description: "Ondas, recogidos o liso pulido", durationMin: 45, priceClp: 20000 },
    ],
    staff: [
      { id: "a3000000-0000-4000-8000-000000000001", name: "Antonia", roleTitle: "Estilista senior", avatarUrl: null, serviceIds: ["a3100000-0000-4000-8000-000000000001", "a3100000-0000-4000-8000-000000000002", "a3100000-0000-4000-8000-000000000003", "a3100000-0000-4000-8000-000000000004"] },
      { id: "a3000000-0000-4000-8000-000000000002", name: "Diego", roleTitle: "Colorista", avatarUrl: null, serviceIds: ["a3100000-0000-4000-8000-000000000002", "a3100000-0000-4000-8000-000000000003"] },
    ],
  },
];

/** Compatibilidad con código previo. */
export const DEMO_BUSINESS = DEMO_BUSINESSES[0];

// En demo, los negocios tienen Premium (lo que se ve en una prueba recién creada).
const DEMO_FEATURES: FeatureKey[] = ["client_reminders", "revenue_stats", "custom_branding", "hide_branding", "no_show_control"];

export function demoBusinessBySlug(slug: string): Business | null {
  const business = DEMO_BUSINESSES.find((b) => b.slug === slug);
  return business ? { ...business, features: DEMO_FEATURES } : null;
}

export function demoPanelBusinesses(): PanelBusiness[] {
  return DEMO_BUSINESSES.map((b) => ({
    id: b.id, slug: b.slug, name: b.name, category: b.category,
    brandColor: b.brandColor, timezone: b.timezone, role: "owner" as const, published: true,
    entitlements: {
      tier: "premium" as const, maxStaff: 3, maxServices: null, maxMonthlyBookings: null, features: DEMO_FEATURES,
      staffCount: b.staff.length, servicesCount: b.services.length, bookingsThisMonth: 0,
    },
  }));
}

// ─────────────────────────────────────────────────────────────
// Almacén en memoria (se pierde al reiniciar el proceso)
// ─────────────────────────────────────────────────────────────
type DemoBooking = {
  id: string;
  token: string;
  businessId: string;
  serviceId: string;
  staffId: string;
  date: string;
  start: number;
  end: number;
  clientName: string;
  clientPhone: string;
  priceClp: number;
  status: BookingStatus;
  source: "web" | "panel";
  overbook?: boolean;
};

/** Bloqueo de agenda en demo (instantes UTC, como time_off). */
export type DemoTimeOff = { id: string; businessId: string; staffId: string; startsAt: string; endsAt: string; reason: string | null };

type DemoState = { bookings: DemoBooking[]; timeOff: DemoTimeOff[]; seededFor: string | null };

declare global {
  var __clikiumDemoState: DemoState | undefined;
}

function state(): DemoState {
  const s = (globalThis.__clikiumDemoState ??= { bookings: [], timeOff: [], seededFor: null });
  s.timeOff ??= [];
  seedIfNeeded(s);
  return s;
}

const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

function scheduleFor(staffId: string, date: string): Schedule | null {
  const sched = SCHEDULES[staffId];
  if (!sched || !sched.days.includes(weekdayOf(date))) return null;
  return sched;
}

function fitsSchedule(sched: Schedule, start: number, end: number): boolean {
  if (start < minutes(sched.open) || end > minutes(sched.close)) return false;
  return !sched.breaks.some(([a, b]) => start < minutes(b) && end > minutes(a));
}

function collides(bookings: DemoBooking[], staffId: string, date: string, start: number, end: number, ignoreId?: string) {
  return bookings.some((b) =>
    b.id !== ignoreId && b.status === "confirmed" && b.staffId === staffId && b.date === date &&
    start < b.end && end > b.start);
}

const SAMPLE_CLIENTS = [
  ["Javiera Soto", "+56 9 8765 4321"], ["Tomás Rojas", "+56 9 7654 3210"], ["Catalina Muñoz", "+56 9 6543 2109"],
  ["Benjamín Díaz", "+56 9 5432 1098"], ["Isidora Pérez", "+56 9 4321 0987"], ["Vicente Torres", "+56 9 3210 9876"],
  ["Florencia Vega", "+56 9 2109 8765"], ["Agustín Fuentes", "+56 9 1098 7654"],
];
const SAMPLE_TIMES = ["10:00", "11:00", "12:00", "15:30", "16:30", "17:30"];

/** Agenda de ejemplo desde el día 1 del mes hasta mañana, para que el panel demo tenga agenda e ingresos. */
function seedIfNeeded(s: DemoState) {
  const today = dateInTimeZone(new Date(), TZ);
  if (s.seededFor === today) return;
  s.seededFor = today;
  s.bookings = [];
  const nowMin = minutes(timeInTimeZone(new Date(), TZ));
  const dates: string[] = [];
  for (let d = `${today.slice(0, 7)}-01`; d <= addCalendarDays(today, 1); d = addCalendarDays(d, 1)) dates.push(d);
  let n = 0;
  for (const business of DEMO_BUSINESSES) {
    for (const date of dates) {
      business.staff.forEach((member, staffIndex) => {
        const sched = scheduleFor(member.id, date);
        if (!sched) return;
        SAMPLE_TIMES.forEach((time, i) => {
          if ((i + staffIndex) % 2 === 1) return; // agenda parcialmente ocupada
          const service = business.services.find((sv) => sv.id === member.serviceIds[(i + staffIndex) % member.serviceIds.length]);
          if (!service) return;
          const start = minutes(time);
          const end = start + service.durationMin;
          if (!fitsSchedule(sched, start, end) || collides(s.bookings, member.id, date, start, end)) return;
          const [clientName, clientPhone] = SAMPLE_CLIENTS[n++ % SAMPLE_CLIENTS.length];
          const past = date < today || (date === today && end <= nowMin);
          s.bookings.push({
            id: crypto.randomUUID(), token: newToken(), businessId: business.id, serviceId: service.id,
            staffId: member.id, date, start, end, clientName, clientPhone, priceClp: service.priceClp,
            status: past ? (n % 5 === 0 ? "no_show" : "completed") : "confirmed",
            source: n % 4 === 0 ? "panel" : "web",
          });
        });
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Reservas públicas
// ─────────────────────────────────────────────────────────────
export function demoAvailability(business: Business, serviceId: string, date: string, staffId: string | null): AvailableSlot[] {
  const service = business.services.find((s) => s.id === serviceId);
  if (!service || !dateWithinBookingWindow(date, business.timezone, business.maxDaysAhead)) return [];
  const nowDate = dateInTimeZone(new Date(), business.timezone);
  const nowMin = minutes(timeInTimeZone(new Date(), business.timezone));
  const { bookings } = state();
  const result: AvailableSlot[] = [];
  for (const member of business.staff) {
    if (staffId && member.id !== staffId) continue;
    if (!member.serviceIds.includes(serviceId)) continue;
    const sched = scheduleFor(member.id, date);
    if (!sched) continue;
    for (let start = minutes(sched.open); start + service.durationMin <= minutes(sched.close); start += 60) {
      const end = start + service.durationMin;
      if (!fitsSchedule(sched, start, end)) continue;
      if (date === nowDate && start < nowMin + MIN_NOTICE_MIN) continue;
      if (collides(bookings, member.id, date, start, end)) continue;
      if (blocked(member.id, date, start, end, business.timezone)) continue;
      result.push({ staffId: member.id, staffName: member.name, time: formatMinutes(start) });
    }
  }
  return result.sort((a, b) => a.time.localeCompare(b.time) || a.staffName.localeCompare(b.staffName));
}

export type DemoCreateResult =
  | { ok: true; booking: BookingSuccess }
  | { ok: false; reason: "SLOT_UNAVAILABLE" | "TOO_MANY_BOOKINGS" };

export function demoCreateBooking(business: Business, payload: BookingPayload): DemoCreateResult {
  // Sin awaits entre comprobación y escritura: coherente en un único proceso de desarrollo.
  const s = state();
  const digits = payload.phone.replace(/\D/g, "");
  const today = dateInTimeZone(new Date(), business.timezone);
  const active = s.bookings.filter((b) =>
    b.businessId === business.id && b.status === "confirmed" && b.date >= today &&
    b.clientPhone.replace(/\D/g, "") === digits).length;
  if (active >= MAX_ACTIVE_PER_PHONE) return { ok: false, reason: "TOO_MANY_BOOKINGS" };

  const service = business.services.find((sv) => sv.id === payload.serviceId);
  const candidate = demoAvailability(business, payload.serviceId, payload.date, payload.staffId)
    .find((slot) => slot.time === payload.time);
  if (!candidate || !service) return { ok: false, reason: "SLOT_UNAVAILABLE" };

  const start = minutes(payload.time);
  const booking: DemoBooking = {
    id: crypto.randomUUID(), token: newToken(), businessId: business.id, serviceId: service.id,
    staffId: candidate.staffId, date: payload.date, start, end: start + service.durationMin,
    clientName: payload.name, clientPhone: payload.phone, priceClp: service.priceClp,
    status: "confirmed", source: "web",
  };
  s.bookings.push(booking);
  return {
    ok: true,
    booking: {
      bookingId: booking.id, manageToken: booking.token, assignedStaffId: candidate.staffId,
      assignedStaffName: candidate.staffName, time: candidate.time, demo: true,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Gestión por token
// ─────────────────────────────────────────────────────────────
function startUtc(b: DemoBooking, tz: string) {
  return zonedTimeToUtc(b.date, formatMinutes(b.start), tz);
}

export function demoGetByToken(token: string): ManagedBooking | null {
  const b = state().bookings.find((x) => x.token === token);
  if (!b) return null;
  const business = DEMO_BUSINESSES.find((x) => x.id === b.businessId);
  const service = business?.services.find((x) => x.id === b.serviceId);
  const member = business?.staff.find((x) => x.id === b.staffId);
  if (!business || !service || !member) return null;
  const start = startUtc(b, business.timezone);
  const end = new Date(start.getTime() + (b.end - b.start) * 60_000);
  return {
    bookingId: b.id, status: b.status, startUtc: start.toISOString(), endUtc: end.toISOString(),
    localDate: b.date, localTime: formatMinutes(b.start), priceClp: b.priceClp, clientName: b.clientName,
    serviceName: service.name, durationMin: service.durationMin, staffName: member.name,
    businessName: business.name, businessSlug: business.slug, businessAddress: business.address,
    businessPhone: business.phone, businessCategory: business.category, brandColor: business.brandColor,
    timezone: business.timezone,
    canCancel: b.status === "confirmed" && start.getTime() - business.cancelNoticeMin * 60_000 > Date.now(),
  };
}

export function demoCancelByToken(token: string): CancelResult {
  const view = demoGetByToken(token);
  if (!view) return "NOT_FOUND";
  if (view.status !== "confirmed") return "NOT_CANCELLABLE";
  if (!view.canCancel) return "TOO_LATE";
  const b = state().bookings.find((x) => x.token === token);
  if (b) b.status = "cancelled";
  return "CANCELLED";
}

// ─────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────
export function demoListBookings(businessId: string, date: string): PanelBooking[] {
  const business = DEMO_BUSINESSES.find((x) => x.id === businessId);
  if (!business) return [];
  return state().bookings
    .filter((b) => b.businessId === businessId && b.date === date)
    .sort((a, b) => a.start - b.start)
    .map((b) => ({
      id: b.id,
      date: b.date,
      staffId: b.staffId,
      staffName: business.staff.find((x) => x.id === b.staffId)?.name ?? "—",
      serviceName: business.services.find((x) => x.id === b.serviceId)?.name ?? "—",
      clientName: b.clientName,
      clientPhone: b.clientPhone,
      priceClp: b.priceClp,
      startTime: formatMinutes(b.start),
      endTime: formatMinutes(b.end),
      status: b.status,
      source: b.source,
      overbook: b.overbook ?? false,
    }));
}

export function demoSetStatus(businessId: string, bookingId: string, status: BookingStatus): "OK" | "NOT_FOUND" | "SLOT_TAKEN" {
  const s = state();
  const b = s.bookings.find((x) => x.id === bookingId && x.businessId === businessId);
  if (!b) return "NOT_FOUND";
  if (status === "confirmed" && b.status !== "confirmed" && !b.overbook && collides(s.bookings, b.staffId, b.date, b.start, b.end, b.id)) {
    return "SLOT_TAKEN";
  }
  b.status = status;
  return "OK";
}

export function demoRevenue(businessId: string, from: string, to: string): RevenueDay[] {
  const byDay = new Map<string, RevenueDay>();
  for (const b of state().bookings) {
    if (b.businessId !== businessId || b.date < from || b.date > to) continue;
    if (b.status !== "confirmed" && b.status !== "completed") continue;
    const day = byDay.get(b.date) ?? { day: b.date, totalClp: 0, bookings: 0 };
    day.totalClp += b.priceClp;
    day.bookings += 1;
    byDay.set(b.date, day);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function demoCatalog(businessId: string): PanelCatalog {
  const business = DEMO_BUSINESSES.find((x) => x.id === businessId);
  if (!business) return { services: [], staff: [] };
  return {
    staff: business.staff.map(({ id, name }) => ({ id, name })),
    services: business.services.map((sv) => ({
      id: sv.id, name: sv.name, durationMin: sv.durationMin, priceClp: sv.priceClp,
      staffIds: business.staff.filter((m) => m.serviceIds.includes(sv.id)).map((m) => m.id),
    })),
  };
}

export function demoCreatePanelBooking(
  businessId: string, input: PanelBookingInput,
): "OK" | "SLOT_TAKEN" | "SERVICE_NOT_FOUND" | "STAFF_NOT_FOUND" {
  const business = DEMO_BUSINESSES.find((x) => x.id === businessId);
  const service = business?.services.find((x) => x.id === input.serviceId);
  if (!business || !service) return "SERVICE_NOT_FOUND";
  if (!business.staff.some((m) => m.id === input.staffId && m.serviceIds.includes(service.id))) return "STAFF_NOT_FOUND";
  const s = state();
  const start = minutes(input.time);
  const end = start + service.durationMin;
  if (!input.overbook && collides(s.bookings, input.staffId, input.date, start, end)) return "SLOT_TAKEN";
  s.bookings.push({
    id: crypto.randomUUID(), token: newToken(), businessId, serviceId: service.id, staffId: input.staffId,
    date: input.date, start, end, clientName: input.name, clientPhone: input.phone, priceClp: service.priceClp,
    status: "confirmed", source: "panel", overbook: input.overbook,
  });
  return "OK";
}

function blocked(staffId: string, date: string, start: number, end: number, tz: string): boolean {
  const from = zonedTimeToUtc(date, formatMinutes(start), tz).getTime();
  const to = from + (end - start) * 60_000;
  return state().timeOff.some((t) => t.staffId === staffId && from < Date.parse(t.endsAt) && to > Date.parse(t.startsAt));
}

export function demoListTimeOff(businessId: string): DemoTimeOff[] {
  return state().timeOff.filter((t) => t.businessId === businessId);
}

export function demoSaveTimeOff(businessId: string, staffIds: string[], startsAt: string, endsAt: string, reason: string | null): number {
  const s = state();
  for (const staffId of staffIds) {
    s.timeOff.push({ id: crypto.randomUUID(), businessId, staffId, startsAt, endsAt, reason });
  }
  const tz = DEMO_BUSINESSES.find((b) => b.id === businessId)?.timezone ?? TZ;
  return s.bookings.filter((b) => {
    if (b.businessId !== businessId || b.status !== "confirmed" || !staffIds.includes(b.staffId)) return false;
    const from = zonedTimeToUtc(b.date, formatMinutes(b.start), tz).getTime();
    return from < Date.parse(endsAt) && from + (b.end - b.start) * 60_000 > Date.parse(startsAt);
  }).length;
}

export function demoDeleteTimeOff(businessId: string, ids: string[]): number {
  const s = state();
  const before = s.timeOff.length;
  s.timeOff = s.timeOff.filter((t) => t.businessId !== businessId || !ids.includes(t.id));
  return before - s.timeOff.length;
}

/** Todas las reservas de un negocio demo, en el formato de la exportación (lib/account.ts). */
export function demoExportRows(businessId: string) {
  const business = DEMO_BUSINESSES.find((x) => x.id === businessId);
  if (!business) return [];
  return state().bookings.filter((b) => b.businessId === businessId).map((b) => {
    const start = zonedTimeToUtc(b.date, formatMinutes(b.start), business.timezone);
    return {
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + (b.end - b.start) * 60_000).toISOString(),
      client_name: b.clientName, client_phone: b.clientPhone, client_email: null as string | null,
      price_clp: b.priceClp, status: b.status, source: b.source, is_overbook: b.overbook ?? false, notes: null as string | null,
      services: { name: business.services.find((x) => x.id === b.serviceId)?.name ?? "—" },
      staff: { name: business.staff.find((x) => x.id === b.staffId)?.name ?? "—" },
    };
  });
}

/** Estado de gestión de un negocio demo (para ver las secciones del panel sin Supabase). */
export function demoOnboardingState(businessId: string): OnboardingState {
  const b = DEMO_BUSINESSES.find((x) => x.id === businessId) ?? DEMO_BUSINESSES[0];
  const schedules: Record<string, ScheduleDay[]> = {};
  for (const m of b.staff) {
    const s = SCHEDULES[m.id];
    if (!s) continue;
    schedules[m.id] = s.days.map((weekday) => ({
      weekday, opens: s.open, closes: s.close,
      breakStart: s.breaks[0]?.[0] ?? null, breakEnd: s.breaks[0]?.[1] ?? null,
    }));
  }
  return {
    business: {
      id: b.id, slug: b.slug, name: b.name, category: b.category, tagline: b.tagline,
      description: b.description ?? "", address: b.address, phone: b.phone, brandColor: b.brandColor,
      logoUrl: b.logoUrl, hideBranding: false, published: true, minNoticeMin: MIN_NOTICE_MIN, maxDaysAhead: b.maxDaysAhead,
      cancelNoticeMin: b.cancelNoticeMin,
      slotIntervalMin: 60,
      noShowBlockThreshold: null,
    },
    staff: b.staff.map((m, i) => ({ id: m.id, name: m.name, roleTitle: m.roleTitle ?? "", linkedToMe: i === 0 })),
    services: b.services.map((s) => ({
      id: s.id, name: s.name, description: s.description, priceClp: s.priceClp, durationMin: s.durationMin,
      staffIds: b.staff.filter((m) => m.serviceIds.includes(s.id)).map((m) => m.id),
    })),
    schedules,
  };
}
