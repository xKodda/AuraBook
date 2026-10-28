// Demo pública (/demo): una barbería ficticia que funciona entera en el navegador.
// No llama a la API ni guarda nada: las horas libres se calculan aquí y la reserva se simula.

import { dateInTimeZone, minutes, formatMinutes, timeInTimeZone, weekdayOf } from "./dates";
import type { AvailableSlot, Business } from "./types";

const TZ = "America/Santiago";

export const SANDBOX_BUSINESS: Business = {
  id: "00000000-0000-4000-8000-00000000d3e0",
  slug: "demo",
  name: "Barbería Demo",
  category: "barberia",
  tagline: "Negocio ficticio para probar AuraBook.",
  description: "Esta barbería no existe: es una demostración. Puedes elegir servicio, profesional y hora, y completar la reserva sin que se guarde nada.",
  address: "Dirección de ejemplo, Santiago",
  phone: "+56 9 0000 0000",
  timezone: TZ,
  brandColor: "#2F3A56",
  logoUrl: null,
  maxDaysAhead: 14,
  cancelNoticeMin: 120,
  features: ["client_reminders", "revenue_stats", "custom_branding"],
  services: [
    { id: "d3e00000-0000-4000-8000-000000000001", name: "Corte clásico", description: "Corte y terminaciones de precisión", durationMin: 30, priceClp: 12000 },
    { id: "d3e00000-0000-4000-8000-000000000002", name: "Corte + barba", description: "Experiencia completa para tu estilo", durationMin: 45, priceClp: 17000 },
    { id: "d3e00000-0000-4000-8000-000000000003", name: "Perfilado de barba", description: "Líneas limpias y definición", durationMin: 30, priceClp: 8000 },
  ],
  staff: [
    { id: "d3e10000-0000-4000-8000-000000000001", name: "Camila", roleTitle: "Barbera", avatarUrl: null,
      serviceIds: ["d3e00000-0000-4000-8000-000000000001", "d3e00000-0000-4000-8000-000000000002", "d3e00000-0000-4000-8000-000000000003"] },
    { id: "d3e10000-0000-4000-8000-000000000002", name: "Tomás", roleTitle: "Barbero", avatarUrl: null,
      serviceIds: ["d3e00000-0000-4000-8000-000000000001", "d3e00000-0000-4000-8000-000000000002"] },
  ],
};

type Schedule = { days: number[]; open: string; close: string; breakStart: string; breakEnd: string };

const SCHEDULES: Record<string, Schedule> = {
  "d3e10000-0000-4000-8000-000000000001": { days: [1, 2, 3, 4, 5, 6], open: "10:00", close: "20:00", breakStart: "14:00", breakEnd: "15:00" },
  "d3e10000-0000-4000-8000-000000000002": { days: [2, 3, 4, 5, 6], open: "11:00", close: "19:00", breakStart: "14:00", breakEnd: "15:00" },
};

/** Número estable por texto: la misma hora aparece ocupada en cada visita, como en una agenda real. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function sandboxSlots(serviceId: string, date: string, staffId: string | null): AvailableSlot[] {
  const service = SANDBOX_BUSINESS.services.find((s) => s.id === serviceId);
  if (!service) return [];
  const now = new Date();
  const today = dateInTimeZone(now, TZ);
  const nowMin = minutes(timeInTimeZone(now, TZ)) + 30;
  const result: AvailableSlot[] = [];
  for (const member of SANDBOX_BUSINESS.staff) {
    if ((staffId && member.id !== staffId) || !member.serviceIds.includes(serviceId)) continue;
    const sched = SCHEDULES[member.id];
    if (!sched.days.includes(weekdayOf(date))) continue;
    for (let start = minutes(sched.open); start + service.durationMin <= minutes(sched.close); start += 15) {
      const end = start + service.durationMin;
      if (start < minutes(sched.breakEnd) && end > minutes(sched.breakStart)) continue;
      if (date === today && start < nowMin) continue;
      // Cerca de un tercio de las horas aparece tomada.
      if (hash(`${date}|${member.id}|${Math.floor(start / 45)}`) < 0.33) continue;
      result.push({ staffId: member.id, staffName: member.name, time: formatMinutes(start) });
    }
  }
  return result.sort((a, b) => a.time.localeCompare(b.time) || a.staffName.localeCompare(b.staffName));
}
