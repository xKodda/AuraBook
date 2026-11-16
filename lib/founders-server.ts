import "server-only";
import { DEMO_MODE } from "./env";
import { FOUNDERS_FALLBACK, type FoundersSummary } from "./founders";
import { publicDb } from "./supabase";

const DEMO_SUMMARY: FoundersSummary = {
  total: 15, taken: 2, months: 6, live: true,
  wall: [{ number: 1, name: "Barber Studio", slug: "barber-studio", category: "barberia", logoUrl: null, brandColor: "#8B5E34" }],
};

/** Cupos del Programa Fundadores y muro público. Si la base de datos no responde, valores de respaldo sin contador. */
export async function getFoundersSummary(): Promise<FoundersSummary> {
  if (DEMO_MODE) return DEMO_SUMMARY;
  const { data, error } = await publicDb().rpc("founders_summary").abortSignal(AbortSignal.timeout(4000));
  if (error || !data) {
    console.error("founders_summary:", error?.message);
    return FOUNDERS_FALLBACK;
  }
  return { ...(data as Omit<FoundersSummary, "live">), live: true };
}
