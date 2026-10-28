import "server-only";
import { addCalendarDays, daysInRange, weekdayOf } from "./dates";
import { DEMO_BUSINESSES, DEMO_MODE, demoExportRows } from "./demo";
import { rpcErrorMessage } from "./errors";
import { sessionDb } from "./supabase";
import type { PanelBusiness } from "./types";

/** Estadísticas de un rango (public.panel_insights). Montos estimados a precio de lista, no pagos recibidos. */
export type Insights = {
  totals: {
    bookings: number; confirmed: number; completed: number; noShow: number; cancelled: number; cancelledByClient: number;
    estimatedClp: number; completedClp: number; lostClp: number;
  };
  clients: { unique: number; returning: number; new: number };
  /** dow ISO: 1 = lunes … 7 = domingo. */
  byHour: { dow: number; hour: number; n: number }[];
  byStaff: {
    staffId: string; name: string; bookings: number; completed: number; noShow: number;
    bookedMinutes: number; availableMinutes: number; estimatedClp: number;
  }[];
  byService: { name: string; bookings: number; estimatedClp: number }[];
  topNoShows: { name: string; phone: string; noShows: number }[];
};

export async function getInsights(business: PanelBusiness, from: string, to: string): Promise<Insights | { error: string }> {
  if (DEMO_MODE) return demoInsights(business, from, to);
  const db = await sessionDb();
  const { data, error } = await db.rpc("panel_insights", { p_business_id: business.id, p_from: from, p_to: to });
  if (error) return { error: rpcErrorMessage(error.message) };
  return data as Insights;
}

/** Mismo cálculo que panel_insights, sobre las reservas en memoria del modo demo. */
function demoInsights(business: PanelBusiness, from: string, to: string): Insights {
  const tz = business.timezone;
  const local = (iso: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
  };
  const all = demoExportRows(business.id).map((r) => ({ ...r, ...local(r.start_at), phone: r.client_phone.replace(/\D/g, "") }));
  const rows = all.filter((r) => r.date >= from && r.date <= to);
  const active = rows.filter((r) => r.status !== "cancelled");
  const sum = (list: typeof rows) => list.reduce((s, r) => s + r.price_clp, 0);
  const firstSeen = new Map<string, string>();
  for (const r of all.filter((x) => x.status !== "cancelled")) {
    if (!firstSeen.has(r.phone) || r.date < firstSeen.get(r.phone)!) firstSeen.set(r.phone, r.date);
  }
  const visits = new Map<string, number>();
  for (const r of active) visits.set(r.phone, (visits.get(r.phone) ?? 0) + 1);
  const hours = new Map<string, number>();
  for (const r of active) {
    const dow = ((weekdayOf(r.date) + 6) % 7) + 1;
    hours.set(`${dow}-${r.hour}`, (hours.get(`${dow}-${r.hour}`) ?? 0) + 1);
  }
  const demo = DEMO_BUSINESSES.find((b) => b.id === business.id);
  const days = daysInRange(from, to);
  const staff = (demo?.staff ?? []).map((m) => {
    const mine = active.filter((r) => r.staff.name === m.name);
    let available = 0;
    for (let i = 0; i < days; i++) {
      const wd = weekdayOf(addCalendarDays(from, i));
      if (wd !== 0) available += 9 * 60; // horario demo aproximado (lun–sáb, 9 h con descanso)
    }
    return {
      staffId: m.id, name: m.name, bookings: mine.length,
      completed: mine.filter((r) => r.status === "completed").length, noShow: mine.filter((r) => r.status === "no_show").length,
      bookedMinutes: mine.reduce((s, r) => s + (Date.parse(r.end_at) - Date.parse(r.start_at)) / 60_000, 0),
      availableMinutes: available, estimatedClp: sum(mine.filter((r) => r.status === "confirmed" || r.status === "completed")),
    };
  });
  const services = new Map<string, { bookings: number; estimatedClp: number }>();
  for (const r of active) {
    const s = services.get(r.services.name) ?? { bookings: 0, estimatedClp: 0 };
    s.bookings += 1;
    if (r.status === "confirmed" || r.status === "completed") s.estimatedClp += r.price_clp;
    services.set(r.services.name, s);
  }
  const noShows = new Map<string, { name: string; phone: string; noShows: number }>();
  for (const r of rows.filter((x) => x.status === "no_show")) {
    const n = noShows.get(r.phone) ?? { name: r.client_name, phone: r.client_phone, noShows: 0 };
    n.noShows += 1;
    noShows.set(r.phone, n);
  }
  return {
    totals: {
      bookings: rows.length,
      confirmed: rows.filter((r) => r.status === "confirmed").length,
      completed: rows.filter((r) => r.status === "completed").length,
      noShow: rows.filter((r) => r.status === "no_show").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      cancelledByClient: 0,
      estimatedClp: sum(rows.filter((r) => r.status === "confirmed" || r.status === "completed")),
      completedClp: sum(rows.filter((r) => r.status === "completed")),
      lostClp: sum(rows.filter((r) => r.status === "no_show")),
    },
    clients: {
      unique: visits.size,
      returning: [...visits].filter(([p, n]) => n > 1 || (firstSeen.get(p) ?? from) < from).length,
      new: [...visits].filter(([p, n]) => !(n > 1 || (firstSeen.get(p) ?? from) < from)).length,
    },
    byHour: [...hours].map(([k, n]) => ({ dow: Number(k.split("-")[0]), hour: Number(k.split("-")[1]), n })),
    byStaff: staff.sort((a, b) => b.bookings - a.bookings),
    byService: [...services].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.bookings - a.bookings).slice(0, 8),
    topNoShows: [...noShows.values()].sort((a, b) => b.noShows - a.noShows).slice(0, 5),
  };
}
