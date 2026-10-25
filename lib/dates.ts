export const CHILE_TZ = "America/Santiago";

export function dateInTimeZone(date: Date, timezone = CHILE_TZ): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function timeInTimeZone(date: Date, timezone = CHILE_TZ): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

/** Diferencia (ms) entre la hora local de `timezone` y UTC para un instante dado. */
function timeZoneOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Convierte fecha + hora de pared en `timezone` al instante UTC correspondiente. */
export function zonedTimeToUtc(date: string, time: string, timezone = CHILE_TZ): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = timeZoneOffsetMs(new Date(guess), timezone);
  let utc = guess - first;
  const second = timeZoneOffsetMs(new Date(utc), timezone);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

// UTC a mediodía se usa únicamente para aritmética de días, nunca para horarios de reservas.
export function addCalendarDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function dateWithinBookingWindow(date: string, timezone = CHILE_TZ, maxDays = 30): boolean {
  if (!isIsoDate(date)) return false;
  const today = dateInTimeZone(new Date(), timezone);
  return date >= today && date <= addCalendarDays(today, maxDays);
}

export function suggestedBookingDate(timezone = CHILE_TZ): string {
  const now = new Date();
  const localDate = dateInTimeZone(now, timezone);
  // Si ya pasó la hora habitual de cierre, iniciar por mañana.
  // El usuario siempre puede seleccionar hoy manualmente.
  return timeInTimeZone(now, timezone) >= "19:00"
    ? addCalendarDays(localDate, 1)
    : localDate;
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** Partes cortas para chips de día: { weekday: "vie", day: "24", month: "oct" } */
export function dayChipParts(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-CL", { ...opts, timeZone: "UTC" }).format(d).replace(".", "");
  return { weekday: fmt({ weekday: "short" }), day: fmt({ day: "numeric" }), month: fmt({ month: "short" }) };
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function formatMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Formato compacto UTC para enlaces de Google Calendar: 20261024T153000Z */
export function calendarStamp(isoUtc: string): string {
  return new Date(isoUtc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
