// Capacidades por plan: el único lugar donde la app pregunta qué puede usar un negocio.
// La fuente de verdad es la base de datos (public.business_limits, migraciones 20261102000000 y 20261107000000);
// este módulo solo describe las capacidades y responde `can(...)`, `canAddStaff(...)`, etc.
// No escribir condiciones del tipo `plan === "premium"` en pantallas.

export type FeatureKey = "client_reminders" | "revenue_stats" | "custom_branding";
export type PlanTier = "free" | "premium";

/** Lo que el plan vigente de un negocio permite y cuánto usa hoy. `max*` null = sin límite. */
export type Entitlements = {
  tier: PlanTier;
  maxStaff: number | null;
  maxServices: number | null;
  maxMonthlyBookings: number | null;
  features: FeatureKey[];
  /** Uso actual, para avisar antes de llegar a un límite. */
  staffCount: number;
  servicesCount: number;
  bookingsThisMonth: number;
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
  custom_branding: {
    label: "Tu logo y tu color",
    description: "Tu página de reservas con tu marca, en vez de la de AuraBook.",
  },
};

/** Lo que incluyen todos los planes (se muestra en /precios y en «Mi plan»). Solo funciones que ya existen. */
export const INCLUDED_IN_ALL = [
  "Página de reservas con tu enlace propio",
  "Agenda diaria y semanal",
  "Reservas manuales y sobrecupos desde el panel",
  "Horarios, descansos y bloqueos",
  "Aviso por correo de cada reserva y cancelación",
  "Confirmación por correo para tus clientes",
  "Cancelación online dentro de tu plazo",
  "Botón de WhatsApp en cada cita",
  "Descarga de reservas y clientes (CSV)",
];

/** Si no se pudo leer el plan, se asume Free: nunca se habilita de más por un error. */
export const FREE_ENTITLEMENTS: Entitlements = {
  tier: "free", maxStaff: 2, maxServices: 8, maxMonthlyBookings: 100, features: [],
  staffCount: 0, servicesCount: 0, bookingsThisMonth: 0,
};

export function can(entitlements: Entitlements | undefined, feature: FeatureKey): boolean {
  return !!entitlements?.features.includes(feature);
}

const under = (max: number | null, used: number) => max === null || used < max;

/** true si el plan permite agregar otro profesional. */
export function canAddStaff(entitlements: Entitlements | undefined): boolean {
  const e = entitlements ?? FREE_ENTITLEMENTS;
  return under(e.maxStaff, e.staffCount);
}

/** true si el plan permite agregar otro servicio. */
export function canAddService(entitlements: Entitlements | undefined): boolean {
  const e = entitlements ?? FREE_ENTITLEMENTS;
  return under(e.maxServices, e.servicesCount);
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
  maxServices?: number | null;
  maxMonthlyBookings?: number | null;
  /** Profesionales adicionales sobre los incluidos (Premium). */
  extraStaffPriceClp?: number | null;
  maxExtraStaff?: number | null;
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

/** Líneas de límites de un plan para /precios y «Mi plan». */
export function planLimitLines(plan: PublicPlan, formatPrice: (n: number) => string): string[] {
  const lines: string[] = [];
  if (plan.extraStaffPriceClp && plan.maxStaff !== null && plan.maxExtraStaff) {
    lines.push(`${plan.maxStaff} profesionales incluidos (+${formatPrice(plan.extraStaffPriceClp)} al mes por cada adicional, hasta ${plan.maxStaff + plan.maxExtraStaff})`);
  } else {
    lines.push(staffLimitLabel(plan.maxStaff));
  }
  lines.push(plan.maxServices ? `Hasta ${plan.maxServices} servicios` : "Servicios ilimitados");
  lines.push(plan.maxMonthlyBookings ? `${plan.maxMonthlyBookings} reservas nuevas al mes` : "Reservas ilimitadas");
  return lines;
}

export type PublicPlans = { trialDays: number; plans: PublicPlan[] };

/** Respaldo si la base de datos no responde o en modo demo (mismos valores que la migración 20261107000000). */
export const DEFAULT_PUBLIC_PLANS: PublicPlans = {
  trialDays: 30,
  plans: [
    {
      code: "free", name: "Free", description: "Para empezar y para negocios pequeños.", priceClp: 0, priceYearlyClp: 0,
      maxStaff: 2, maxServices: 8, maxMonthlyBookings: 100, features: [],
    },
    {
      code: "premium", name: "Premium", description: "Para negocios con equipo que quieren crecer y reducir inasistencias.",
      priceClp: 12990, priceYearlyClp: 129900, maxStaff: 3, extraStaffPriceClp: 2990, maxExtraStaff: 5,
      maxServices: null, maxMonthlyBookings: null, features: ["client_reminders", "revenue_stats", "custom_branding"],
    },
  ],
};
