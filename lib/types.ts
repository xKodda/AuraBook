export type BusinessCategory = "barberia" | "peluqueria" | "unas" | "spa" | "estetica" | "otro";

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  priceClp: number;
};

/** Profesional genérico: barbero, estilista, manicurista, terapeuta… */
export type StaffMember = {
  id: string;
  name: string;
  roleTitle: string | null;
  avatarUrl: string | null;
  serviceIds: string[];
};

export type Business = {
  id: string;
  slug: string;
  name: string;
  category: BusinessCategory;
  tagline: string;
  address: string;
  phone: string;
  timezone: string;
  brandColor: string;
  logoUrl: string | null;
  /** Descripción pública del negocio (opcional en datos demo). */
  description?: string;
  maxDaysAhead: number;
  cancelNoticeMin: number;
  services: Service[];
  staff: StaffMember[];
};

export type AvailableSlot = {
  time: string;
  staffId: string;
  staffName: string;
};

export type BookingPayload = {
  slug: string;
  serviceId: string;
  staffId: string | null;
  date: string;
  time: string;
  name: string;
  phone: string;
};

export type BookingSuccess = {
  bookingId: string;
  manageToken: string;
  assignedStaffId: string;
  assignedStaffName: string;
  time: string;
  demo: boolean;
};

export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

/** Vista del cliente en /reserva/[token]. */
export type ManagedBooking = {
  bookingId: string;
  status: BookingStatus;
  startUtc: string;
  endUtc: string;
  localDate: string;
  localTime: string;
  priceClp: number;
  clientName: string;
  serviceName: string;
  durationMin: number;
  staffName: string;
  businessName: string;
  businessSlug: string;
  businessAddress: string;
  businessPhone: string;
  businessCategory: BusinessCategory;
  brandColor: string;
  timezone: string;
  canCancel: boolean;
};

export type CancelResult = "CANCELLED" | "NOT_FOUND" | "NOT_CANCELLABLE" | "TOO_LATE";

/** Fila de la agenda en el panel. */
export type PanelBooking = {
  id: string;
  staffId: string;
  staffName: string;
  serviceName: string;
  clientName: string;
  clientPhone: string;
  priceClp: number;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  source: "web" | "panel";
};

export type BusinessRole = "owner" | "admin" | "staff";

export type PanelBusiness = {
  id: string;
  slug: string;
  name: string;
  category: BusinessCategory;
  brandColor: string;
  timezone: string;
  role: BusinessRole;
  /** Visible en /reservar/[slug] (businesses.is_active). */
  published: boolean;
  /** Solo para owner/admin. */
  billing?: BillingSummary;
};

/** Un día del horario semanal. weekday sigue a PostgreSQL: domingo = 0. */
export type ScheduleDay = {
  weekday: number;
  opens: string;
  closes: string;
  breakStart: string | null;
  breakEnd: string | null;
};

export type OnboardingBusiness = {
  id: string;
  slug: string;
  name: string;
  category: BusinessCategory;
  tagline: string;
  description: string;
  address: string;
  phone: string;
  brandColor: string;
  logoUrl: string | null;
  published: boolean;
};

export type OnboardingStaff = { id: string; name: string; roleTitle: string; linkedToMe: boolean };

export type OnboardingService = {
  id: string;
  name: string;
  description: string;
  priceClp: number;
  durationMin: number;
  staffIds: string[];
};

export type OnboardingState = {
  business: OnboardingBusiness | null;
  staff: OnboardingStaff[];
  services: OnboardingService[];
  /** Horario por profesional (id → días). Un profesional sin entrada no tiene horario. */
  schedules: Record<string, ScheduleDay[]>;
};


// ─── Suscripciones y panel de plataforma ───

export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled";
export type PaymentMethod = "transferencia" | "efectivo" | "tarjeta" | "otro";

export type Plan = {
  id: string;
  name: string;
  description: string;
  priceClp: number;
  /** null = sin límite. */
  maxStaff: number | null;
};

export type AdminPlan = Plan & { isActive: boolean; subscribers: number };

export type AdminBusiness = {
  id: string;
  name: string;
  slug: string;
  category: BusinessCategory;
  published: boolean;
  createdAt: string;
  phone: string;
  ownerEmail: string;
  planId: string | null;
  planName: string | null;
  planPriceClp: number | null;
  maxStaff: number | null;
  status: SubscriptionStatus;
  trialEndsAt: string;
  paidUntil: string | null;
  notes: string;
  staffCount: number;
  bookings30d: number;
  lastPaidAt: string | null;
};

export type AdminPayment = {
  id: string;
  businessId: string;
  businessName: string;
  planName: string | null;
  amountClp: number;
  paidAt: string;
  months: number;
  periodStart: string;
  periodEnd: string;
  method: PaymentMethod;
  reference: string;
};

export type AdminSnapshot = {
  overview: {
    mrrClp: number;
    collectedThisMonthClp: number;
    collectedLastMonthClp: number;
    businessesTotal: number;
    businessesPublished: number;
    newThisMonth: number;
    bookings30d: number;
    byStatus: Record<SubscriptionStatus, number>;
    /** Últimos 6 meses, el último es el mes en curso. month = "YYYY-MM". */
    revenueByMonth: { month: string; amountClp: number }[];
  };
  businesses: AdminBusiness[];
  plans: AdminPlan[];
  payments: AdminPayment[];
  settings: { trialDays: number };
};

export type BusinessSubscription = {
  status: SubscriptionStatus;
  trialEndsAt: string;
  paidUntil: string | null;
  plan: Plan | null;
  staffCount: number;
  payments: { id: string; paidAt: string; amountClp: number; months: number; periodEnd: string; method: PaymentMethod; planName: string | null }[];
  availablePlans: Plan[];
};

/** Resumen para avisos en el panel del negocio. */
export type BillingSummary = { status: SubscriptionStatus; endsAt: string | null };
