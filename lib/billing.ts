// Helpers puros de suscripción, compartidos por el panel de plataforma y el del negocio.
import type { BillingSummary, PaymentMethod, SubscriptionStatus } from "./types";

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: "En prueba",
  active: "Activa",
  past_due: "Vencida",
  cancelled: "Cancelada",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

const DAY_MS = 86_400_000;

/** Días completos desde `now` hasta `iso` (negativo si ya pasó). */
export function daysUntil(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS);
}

/** Fecha corta en hora de Chile: "24 oct 2026". */
export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : "America/Santiago",
  }).format(date).replace(".", "");
}

/** "2026-10" → "oct". */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" })
    .format(new Date(`${month}-15T12:00:00Z`))
    .replace(".", "");
}

export type BillingAlert = { tone: "info" | "warning"; message: string };

/** Aviso para el dueño en su panel. Sin bloqueo: solo informa. */
export function billingAlert(billing: BillingSummary | undefined, now = new Date()): BillingAlert | null {
  if (!billing) return null;
  const days = daysUntil(billing.endsAt, now);
  if (billing.status === "past_due") {
    return { tone: "warning", message: "Tu plan está vencido. Tu página sigue activa; regulariza el pago para no perder el servicio." };
  }
  if (billing.status === "trial" && days !== null && days <= 7) {
    return {
      tone: "info",
      message: days <= 1 ? "Tu prueba gratis termina hoy." : `Tu prueba gratis termina en ${days} días.`,
    };
  }
  if (billing.status === "active" && days !== null && days <= 5) {
    return { tone: "info", message: `Tu plan se renueva en ${Math.max(days, 0)} días.` };
  }
  return null;
}
