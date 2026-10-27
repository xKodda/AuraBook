"use server";

import { z } from "zod";
import { getDashboardContext } from "@/lib/dashboard";
import { isIsoDate } from "@/lib/dates";
import { rpcErrorMessage } from "@/lib/errors";
import { deleteTimeOff, listUpcomingTimeOff, saveTimeOff } from "@/lib/time-off";
import type { TimeOffBlock } from "@/lib/types";

export type TimeOffResult =
  | { ok: true; blocks: TimeOffBlock[]; affected: number }
  | { ok: false; error: string };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.object({
  staffIds: z.array(z.uuid()).min(1).max(50),
  allDay: z.boolean(),
  fromDate: z.string().refine(isIsoDate),
  toDate: z.string().refine(isIsoDate),
  fromTime: time,
  toTime: time,
  reason: z.string().trim().max(80),
});

/** El negocio que se administra, si el usuario es owner/admin. */
async function managedBusiness() {
  const ctx = await getDashboardContext();
  if (!ctx || ctx.business.role === "staff") return null;
  return ctx.business;
}

export async function saveTimeOffAction(input: unknown): Promise<TimeOffResult> {
  const business = await managedBusiness();
  if (!business) return { ok: false, error: rpcErrorMessage("FORBIDDEN") };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa las fechas y horas del bloqueo." };
  if (parsed.data.allDay && parsed.data.toDate < parsed.data.fromDate) {
    return { ok: false, error: "La fecha de término debe ser igual o posterior a la de inicio." };
  }
  const saved = await saveTimeOff(business, parsed.data);
  if ("error" in saved) return { ok: false, error: saved.error };
  return { ok: true, blocks: await listUpcomingTimeOff(business), affected: saved.affected };
}

export async function deleteTimeOffAction(ids: string[]): Promise<TimeOffResult> {
  const business = await managedBusiness();
  if (!business) return { ok: false, error: rpcErrorMessage("FORBIDDEN") };
  if (!z.array(z.uuid()).min(1).max(50).safeParse(ids).success) return { ok: false, error: "Bloqueo no válido." };
  const result = await deleteTimeOff(business, ids);
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, blocks: await listUpcomingTimeOff(business), affected: 0 };
}
