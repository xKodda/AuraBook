// Capacidades por plan: el único lugar donde la app pregunta qué puede usar un negocio.
// La fuente de verdad es la base de datos (public.business_limits, migración 20261102000000); este módulo solo
// describe las capacidades y responde `can(...)`. No escribir condiciones del tipo `plan === "premium"` en pantallas.

export type FeatureKey = "client_reminders" | "revenue_stats";
export type PlanTier = "free" | "premium";

/** Lo que el plan vigente de un negocio permite. `maxStaff` null = sin límite. */
export type Entitlements = {
  tier: PlanTier;
  maxStaff: number | null;
  features: FeatureKey[];
  /** Profesionales activos hoy (para avisar antes de llegar al límite). */
  staffCount: number;
};

export const FEATURES: Record<FeatureKey, { label: string; description: string }> = {
  client_reminders: {
    label: "Recordatorio el día antes",
    description: "Tus clientes reciben un correo el día anterior a su cita. Menos inasistencias.",
  },
  revenue_stats: {
    label: "Ingresos por semana y mes",
    description: "Cuánto generas por semana, por mes o entre las fechas que elijas.",
  },
};

/** Lo que incluyen todos los planes (se muestra en /precios y en «Mi plan»). */
export const INCLUDED_IN_ALL = [
  "Página de reservas con tu logo y color",
  "Servicios, horarios y reservas ilimitadas",
  "Aviso por correo de cada reserva nueva",
  "Confirmación por correo para tus clientes",
  "Reservas manuales y sobrecupos desde el panel",
  "Cancelación online dentro de tu plazo",
];

/** Si no se pudo leer el plan, se asume Free: nunca se habilita de más por un error. */
export const FREE_ENTITLEMENTS: Entitlements = { tier: "free", maxStaff: 1, features: [], staffCount: 0 };

export function can(entitlements: Entitlements | undefined, feature: FeatureKey): boolean {
  return !!entitlements?.features.includes(feature);
}

/** true si el plan permite agregar otro profesional. */
export function canAddStaff(entitlements: Entitlements | undefined): boolean {
  const e = entitlements ?? FREE_ENTITLEMENTS;
  return e.maxStaff === null || e.staffCount < e.maxStaff;
}

export function staffLimitLabel(maxStaff: number | null): string {
  if (maxStaff === null) return "Profesionales ilimitados";
  return maxStaff === 1 ? "1 profesional" : `Hasta ${maxStaff} profesionales`;
}

export const TIER_LABEL: Record<PlanTier, string> = { free: "Free", premium: "Premium" };

/** Plan publicado en /precios (public.public_plans). */
export type PublicPlan = {
  code: PlanTier;
  name: string;
  description: string;
  priceClp: number;
  priceYearlyClp: number | null;
  maxStaff: number | null;
  features: FeatureKey[];
  /** Precio de lanzamiento mensual durante los primeros `promoMonths` meses (null = sin promoción). */
  promoPriceClp?: number | null;
  promoMonths?: number | null;
};

/** Promoción mensual vigente de un plan, si la hay. */
export function launchPromo(plan: PublicPlan): { priceClp: number; months: number } | null {
  if (plan.promoPriceClp == null || !plan.promoMonths || plan.promoPriceClp >= plan.priceClp) return null;
  return { priceClp: plan.promoPriceClp, months: plan.promoMonths };
}

export type PublicPlans = { trialDays: number; plans: PublicPlan[] };

/** Respaldo si la base de datos no responde o en modo demo (mismos valores que la migración). */
export const DEFAULT_PUBLIC_PLANS: PublicPlans = {
  trialDays: 30,
  plans: [
    { code: "free", name: "Free", description: "Para quien atiende solo.", priceClp: 0, priceYearlyClp: 0, maxStaff: 1, features: [] },
    {
      code: "premium", name: "Premium", description: "Para negocios con equipo que quieren menos inasistencias.",
      priceClp: 15990, priceYearlyClp: 159900, maxStaff: 3, features: ["client_reminders", "revenue_stats"],
      promoPriceClp: 12990, promoMonths: 6,
    },
  ],
};
