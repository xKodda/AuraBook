import "server-only";
import { DEMO_BUSINESSES, DEMO_MODE, demoDeleteTimeOff, demoListTimeOff, demoSaveTimeOff, type DemoTimeOff } from "./demo";
import { addCalendarDays, dateInTimeZone, timeInTimeZone, zonedTimeToUtc } from "./dates";
import { rpcErrorMessage } from "./errors";
import { sessionDb } from "./supabase";
import type { PanelBusiness, TimeOffBlock } from "./types";

type Row = { id: string; staff_id: string; starts_at: string; ends_at: string; reason: string | null };

async function rows(business: PanelBusiness, from: Date, to: Date): Promise<Row[]> {
  if (DEMO_MODE) {
    return demoListTimeOff(business.id)
      .filter((t) => Date.parse(t.endsAt) > from.getTime() && Date.parse(t.startsAt) < to.getTime())
      .map((t: DemoTimeOff) => ({ id: t.id, staff_id: t.staffId, starts_at: t.startsAt, ends_at: t.endsAt, reason: t.reason }));
  }
  const db = await sessionDb();
  const { data, error } = await db.from("time_off").select("id,staff_id,starts_at,ends_at,reason")
    .eq("business_id", business.id).gt("ends_at", from.toISOString()).lt("starts_at", to.toISOString())
    .order("starts_at").limit(500);
  if (error) throw new Error(`No se pudieron cargar los bloqueos: ${error.message}`);
  return (data ?? []) as Row[];
}

async function staffNames(business: PanelBusiness): Promise<Map<string, string>> {
  if (DEMO_MODE) return new Map((DEMO_BUSINESSES.find((b) => b.id === business.id)?.staff ?? []).map((m) => [m.id, m.name]));
  const db = await sessionDb();
  const { data } = await db.from("staff").select("id,name").eq("business_id", business.id);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
}

/** Agrupa las filas creadas juntas (mismo inicio, fin y motivo) en un solo bloqueo. */
function group(list: Row[], names: Map<string, string>, tz: string): TimeOffBlock[] {
  const blocks = new Map<string, TimeOffBlock>();
  for (const r of list) {
    const key = `${r.starts_at}|${r.ends_at}|${r.reason ?? ""}`;
    let block = blocks.get(key);
    if (!block) {
      const start = new Date(r.starts_at);
      const end = new Date(r.ends_at);
      const fromTime = timeInTimeZone(start, tz);
      const toTime = timeInTimeZone(end, tz);
      block = {
        ids: [], staffIds: [], staffNames: [], reason: r.reason ?? "",
        allDay: fromTime === "00:00" && toTime === "00:00",
        fromDate: dateInTimeZone(start, tz), fromTime, toDate: dateInTimeZone(end, tz), toTime,
      };
      blocks.set(key, block);
    }
    block.ids.push(r.id);
    block.staffIds.push(r.staff_id);
    block.staffNames.push(names.get(r.staff_id) ?? "—");
  }
  return [...blocks.values()];
}

/** Bloqueos vigentes y futuros. */
export async function listUpcomingTimeOff(business: PanelBusiness): Promise<TimeOffBlock[]> {
  const [list, names] = await Promise.all([rows(business, new Date(), new Date("9999-12-31")), staffNames(business)]);
  return group(list, names, business.timezone);
}

/** Bloqueos que tocan un día de la agenda. */
export function listDayTimeOff(business: PanelBusiness, date: string): Promise<TimeOffBlock[]> {
  return listRangeTimeOff(business, date, date);
}

/** Bloqueos que tocan alguna fecha entre `fromDate` y `toDate` (ambas incluidas). */
export async function listRangeTimeOff(business: PanelBusiness, fromDate: string, toDate: string): Promise<TimeOffBlock[]> {
  const from = zonedTimeToUtc(fromDate, "00:00", business.timezone);
  const to = zonedTimeToUtc(addCalendarDays(toDate, 1), "00:00", business.timezone);
  const [list, names] = await Promise.all([rows(business, from, to), staffNames(business)]);
  return group(list, names, business.timezone);
}

export type TimeOffInput = { staffIds: string[]; allDay: boolean; fromDate: string; toDate: string; fromTime: string; toTime: string; reason: string };

/** Crea el bloqueo; devuelve cuántas reservas confirmadas quedan dentro (no se cancelan solas). Errores listos para mostrar. */
export async function saveTimeOff(business: PanelBusiness, input: TimeOffInput): Promise<{ affected: number } | { error: string }> {
  const tz = business.timezone;
  const startsAt = zonedTimeToUtc(input.fromDate, input.allDay ? "00:00" : input.fromTime, tz);
  const endsAt = input.allDay
    ? zonedTimeToUtc(addCalendarDays(input.toDate, 1), "00:00", tz)
    : zonedTimeToUtc(input.fromDate, input.toTime, tz);
  if (endsAt <= startsAt) return { error: "La hora de término debe ser posterior a la de inicio." };
  if (endsAt.getTime() <= Date.now()) return { error: "Ese rango ya pasó." };
  const reason = input.reason.trim() || null;
  if (DEMO_MODE) return { affected: demoSaveTimeOff(business.id, input.staffIds, startsAt.toISOString(), endsAt.toISOString(), reason) };
  const db = await sessionDb();
  const { data, error } = await db.rpc("save_time_off", {
    p_business_id: business.id, p_staff_ids: input.staffIds,
    p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString(), p_reason: reason,
  });
  if (error) return { error: rpcErrorMessage(error.message) };
  return { affected: Number(data ?? 0) };
}

export async function deleteTimeOff(business: PanelBusiness, ids: string[]): Promise<{ ok: true } | { error: string }> {
  if (DEMO_MODE) {
    demoDeleteTimeOff(business.id, ids);
    return { ok: true };
  }
  const db = await sessionDb();
  const { error } = await db.rpc("delete_time_off", { p_business_id: business.id, p_ids: ids });
  return error ? { error: rpcErrorMessage(error.message) } : { ok: true };
}
