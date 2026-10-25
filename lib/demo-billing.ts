// Datos de ejemplo para ver /admin y /dashboard/plan con DEMO_MODE. Los precios son ilustrativos.
import type { AdminBusiness, AdminPayment, AdminPlan, AdminSnapshot, BusinessSubscription } from "./types";

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const day = (days: number) => at(days).slice(0, 10);

const PLANS: AdminPlan[] = [
  { id: "d0000000-0000-4000-8000-000000000001", name: "Esencial", description: "Para quien atiende solo.", priceClp: 9990, maxStaff: 1, isActive: true, subscribers: 0 },
  { id: "d0000000-0000-4000-8000-000000000002", name: "Equipo", description: "Hasta 5 profesionales.", priceClp: 19990, maxStaff: 5, isActive: true, subscribers: 0 },
  { id: "d0000000-0000-4000-8000-000000000003", name: "Salón", description: "Profesionales ilimitados.", priceClp: 34990, maxStaff: null, isActive: true, subscribers: 0 },
];

type Seed = [name: string, slug: string, category: AdminBusiness["category"], plan: number | null,
  status: AdminBusiness["status"], createdDaysAgo: number, staff: number, bookings: number];

const SEEDS: Seed[] = [
  ["Barber Studio", "barber-studio", "barberia", 1, "active", 120, 2, 84],
  ["Aura Nails Studio", "aura-nails", "unas", 0, "active", 95, 2, 61],
  ["Salón Lumière", "salon-lumiere", "peluqueria", 2, "active", 70, 6, 132],
  ["Barbería Norte", "barberia-norte", "barberia", 1, "past_due", 60, 3, 22],
  ["Estudio Kora", "estudio-kora", "estetica", null, "trial", 9, 1, 7],
  ["Spa Raíz", "spa-raiz", "spa", null, "trial", 3, 2, 1],
  ["Uñas Marga", "unas-marga", "unas", 0, "cancelled", 150, 1, 0],
];

function businesses(): AdminBusiness[] {
  return SEEDS.map(([name, slug, category, planIndex, status, created, staff, bookings], i) => {
    const plan = planIndex === null ? null : PLANS[planIndex];
    const trialEnds = at(-created + 14);
    return {
      id: `d1000000-0000-4000-8000-00000000000${i}`,
      name, slug, category,
      published: status !== "cancelled",
      createdAt: at(-created),
      phone: "+56 9 1234 5678",
      ownerEmail: `contacto@${slug}.cl`,
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      planPriceClp: plan?.priceClp ?? null,
      maxStaff: plan?.maxStaff ?? null,
      status,
      trialEndsAt: trialEnds,
      paidUntil: status === "active" ? at(4 + i * 9) : status === "past_due" ? at(-6) : status === "cancelled" ? at(-40) : null,
      notes: status === "cancelled" ? "Cerró el local." : "",
      staffCount: staff,
      bookings30d: bookings,
      lastPaidAt: status === "trial" ? null : day(status === "active" ? -26 + i * 9 : -36),
    };
  });
}

function payments(list: AdminBusiness[]): AdminPayment[] {
  const out: AdminPayment[] = [];
  list.filter((b) => b.planId).forEach((b, i) => {
    const months = b.status === "cancelled" ? 2 : b.status === "past_due" ? 3 : 5;
    for (let m = 0; m < months; m++) {
      const paid = -(m * 30 + 4 + i * 3) - (b.status === "cancelled" ? 70 : b.status === "past_due" ? 36 : 0);
      out.push({
        id: `d2000000-0000-4000-8000-${String(i * 10 + m).padStart(12, "0")}`,
        businessId: b.id, businessName: b.name, planName: b.planName,
        amountClp: b.planPriceClp ?? 0, paidAt: day(paid), months: 1,
        periodStart: at(paid), periodEnd: at(paid + 30),
        method: m % 3 === 2 ? "efectivo" : "transferencia",
        reference: m % 3 === 2 ? "" : `TRX-${4000 + i * 10 + m}`,
      });
    }
  });
  return out.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export function demoAdminSnapshot(): AdminSnapshot {
  const list = businesses();
  const pays = payments(list);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(15);
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const sumMonth = (month: string) => pays.filter((p) => p.paidAt.startsWith(month)).reduce((s, p) => s + p.amountClp, 0);
  const count = (status: AdminBusiness["status"]) => list.filter((b) => b.status === status).length;
  return {
    overview: {
      mrrClp: list.filter((b) => b.status === "active").reduce((s, b) => s + (b.planPriceClp ?? 0), 0),
      collectedThisMonthClp: sumMonth(thisMonth),
      collectedLastMonthClp: sumMonth(months[4]),
      businessesTotal: list.length,
      businessesPublished: list.filter((b) => b.published).length,
      newThisMonth: list.filter((b) => b.createdAt.startsWith(thisMonth)).length,
      bookings30d: list.reduce((s, b) => s + b.bookings30d, 0),
      byStatus: { trial: count("trial"), active: count("active"), past_due: count("past_due"), cancelled: count("cancelled") },
      revenueByMonth: months.map((month) => ({ month, amountClp: sumMonth(month) })),
    },
    businesses: list,
    plans: PLANS.map((p) => ({
      ...p,
      subscribers: list.filter((b) => b.planId === p.id && (b.status === "active" || b.status === "trial")).length,
    })),
    payments: pays,
    settings: { trialDays: 14 },
  };
}

export function demoBusinessSubscription(): BusinessSubscription {
  const plan = PLANS[1];
  return {
    status: "active",
    trialEndsAt: at(-106),
    paidUntil: at(4),
    plan,
    staffCount: 2,
    payments: [0, 1, 2].map((m) => ({
      id: `d3000000-0000-4000-8000-00000000000${m}`,
      paidAt: day(-(26 + m * 30)), amountClp: plan.priceClp, months: 1,
      periodEnd: at(4 - m * 30), method: "transferencia" as const, planName: plan.name,
    })),
    availablePlans: PLANS,
  };
}
