// Capacidades por plan: el único lugar donde la app pregunta qué puede usar un negocio.
// La fuente de verdad es la base de datos (public.business_limits, migraciones 20261102000000 y 20261107000000);
// este módulo solo describe las capacidades y responde `can(...)`, `canAddStaff(...)`, etc.
// No escribir condiciones del tipo `plan === "premium"` en pantallas.

export type FeatureKey = "client_reminders" | "revenue_stats" | "custom_branding" | "hide_branding";
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
    label: "Tus colores",
    description: "Tu página de reservas con el color de tu marca.",
  },
  hide_branding: {
    label: "Sin marca AuraBook",
    description: "Tu página de reservas sin el «Reservas con AuraBook» al pie.",
  },
};

/** Si no se pudo leer el plan, se asume Free: nunca se habilita de más por un error. */
export const FREE_ENTITLEMENTS: Entitlements = {
  tier: "free", maxStaff: 2, maxServices: 8, maxMonthlyBookings: 100, features: ["client_reminders"],
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
  lines.push(plan.maxMonthlyBookings ? `${plan.maxMonthlyBookings} reservas al mes` : "Reservas ilimitadas");
  return lines;
}

export type PublicPlans = { trialDays: number; plans: PublicPlan[] };

/**
 * Tabla comparativa de /precios. `true` = incluido, `false` = no incluido, texto = detalle, `SOON` = aún en desarrollo
 * (se muestra como «Próximamente»; nunca se presenta como disponible algo que no existe).
 * Los límites numéricos se completan con los datos del plan (public_plans) al mostrarla.
 */
export const SOON = "soon" as const;
export type CompareValue = boolean | string | typeof SOON;
export type CompareRow = { label: string; free: CompareValue; premium: CompareValue; hint?: string };

export function comparison(free: PublicPlan, premium: PublicPlan, formatPrice: (n: number) => string): { title: string; rows: CompareRow[] }[] {
  const extra = premium.extraStaffPriceClp && premium.maxStaff !== null && premium.maxExtraStaff
    ? `${premium.maxStaff} (+${formatPrice(premium.extraStaffPriceClp)} c/u, hasta ${premium.maxStaff + premium.maxExtraStaff})`
    : String(premium.maxStaff ?? "Ilimitados");
  return [
    {
      title: "Agenda y reservas",
      rows: [
        { label: "Página pública de reservas", free: true, premium: true },
        { label: "Enlace para Instagram y WhatsApp", free: true, premium: true },
        { label: "Profesionales", free: String(free.maxStaff ?? "Ilimitados"), premium: extra },
        { label: "Reservas al mes", free: free.maxMonthlyBookings ? String(free.maxMonthlyBookings) : "Ilimitadas", premium: "Ilimitadas",
          hint: "Cuentan las reservas activas del mes de la cita; las canceladas no cuentan." },
        { label: "Servicios", free: free.maxServices ? String(free.maxServices) : "Ilimitados", premium: "Ilimitados" },
        { label: "Horarios, descansos y bloqueos", free: true, premium: true },
        { label: "Agenda diaria y semanal", free: true, premium: true },
        { label: "Reservas manuales y sobrecupos", free: true, premium: true },
        { label: "Cancelación online por el cliente", free: true, premium: true },
        { label: "Reprogramar citas", free: SOON, premium: SOON },
        { label: "Reservas de varios servicios juntos", free: false, premium: SOON },
      ],
    },
    {
      title: "Clientes y comunicación",
      rows: [
        { label: "Confirmación por correo", free: true, premium: true },
        { label: "Recordatorio por correo el día antes", free: true, premium: true },
        { label: "Recordatorios configurables", free: false, premium: SOON },
        { label: "Botón de WhatsApp en cada cita", free: true, premium: true },
        { label: "Seguimiento de asistencias y ausencias", free: false, premium: SOON },
        { label: "Ficha avanzada de clientes", free: false, premium: SOON },
        { label: "Recordatorios automáticos por WhatsApp", free: false, premium: "Complemento futuro" },
      ],
    },
    {
      title: "Negocio y crecimiento",
      rows: [
        { label: "Tu logo", free: true, premium: true },
        { label: "Tus colores", free: false, premium: true },
        { label: "Ocultar la marca AuraBook", free: false, premium: true },
        { label: "Ingresos por semana, mes o fechas", free: false, premium: true },
        { label: "Estadísticas avanzadas", free: false, premium: SOON },
        { label: "Abonos y pagos online al reservar", free: false, premium: SOON },
        { label: "Código QR de tu página", free: SOON, premium: SOON },
        { label: "Descarga de reservas y clientes (CSV)", free: true, premium: true },
        { label: "Seguridad, cancelaciones y respaldo de tus datos", free: true, premium: true },
      ],
    },
  ];
}

/** Las seis características que se muestran en cada tarjeta; el detalle completo va en la comparación. */
export function keyFeatures(plan: PublicPlan, formatPrice: (n: number) => string): { text: string; soon?: boolean }[] {
  if (plan.code === "free") {
    return [
      { text: staffLimitLabel(plan.maxStaff) },
      { text: plan.maxMonthlyBookings ? `${plan.maxMonthlyBookings} reservas al mes` : "Reservas ilimitadas" },
      { text: plan.maxServices ? `Hasta ${plan.maxServices} servicios` : "Servicios ilimitados" },
      { text: "Agenda online, reservas 24/7" },
      { text: "Confirmación y recordatorio por correo" },
      { text: "Tu logo en tu página" },
    ];
  }
  return [
    { text: plan.extraStaffPriceClp && plan.maxStaff !== null
      ? `${plan.maxStaff} profesionales incluidos (+${formatPrice(plan.extraStaffPriceClp)} c/u)`
      : staffLimitLabel(plan.maxStaff) },
    { text: "Reservas y servicios ilimitados" },
    { text: "Tus colores y sin marca AuraBook" },
    { text: "Ingresos por semana, mes o fechas" },
    { text: "Todo lo de Free" },
    { text: "Control de ausencias, reservas combinadas y abonos", soon: true },
  ];
}

/** Precio mensual de Premium según el equipo (los adicionales se pagan mes a mes). null = supera el máximo. */
export function premiumMonthlyFor(plan: PublicPlan, staff: number): number | null {
  const included = plan.maxStaff ?? staff;
  const extra = Math.max(0, staff - included);
  if (extra > (plan.maxExtraStaff ?? 0)) return null;
  return plan.priceClp + extra * (plan.extraStaffPriceClp ?? 0);
}

/** Respaldo si la base de datos no responde o en modo demo (mismos valores que la migración 20261107000000). */
export const DEFAULT_PUBLIC_PLANS: PublicPlans = {
  trialDays: 30,
  plans: [
    {
      code: "free", name: "Free", description: "Para empezar y para negocios pequeños.", priceClp: 0, priceYearlyClp: 0,
      maxStaff: 2, maxServices: 8, maxMonthlyBookings: 100, features: ["client_reminders"],
    },
    {
      code: "premium", name: "Premium", description: "Para negocios con equipo que quieren crecer y reducir inasistencias.",
      priceClp: 12990, priceYearlyClp: 129900, maxStaff: 3, extraStaffPriceClp: 2990, maxExtraStaff: 5,
      maxServices: null, maxMonthlyBookings: null, features: ["client_reminders", "revenue_stats", "custom_branding", "hide_branding"],
    },
  ],
};
