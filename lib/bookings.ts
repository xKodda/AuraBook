import "server-only";
import { DEMO_MODE, demoCancelByToken, demoGetByToken } from "./demo";
import { dateInTimeZone, timeInTimeZone } from "./dates";
import { privilegedDb } from "./supabase";
import type { BookingStatus, BusinessCategory, CancelResult, ManagedBooking } from "./types";
import { manageTokenSchema } from "./validation";

type DbManaged = {
  booking_id: string;
  status: BookingStatus;
  start_at: string;
  end_at: string;
  price_clp: number;
  client_name: string;
  service_name: string;
  duration_min: number;
  staff_name: string;
  business_name: string;
  business_slug: string;
  business_address: string | null;
  business_phone: string | null;
  business_category: BusinessCategory;
  brand_color: string;
  timezone: string;
  can_cancel: boolean;
};

/** Reserva vista por el cliente a través de su token privado. */
export async function getManagedBooking(token: string): Promise<ManagedBooking | null> {
  if (!manageTokenSchema.safeParse(token).success) return null;
  if (DEMO_MODE) return demoGetByToken(token);
  const { data, error } = await privilegedDb().rpc("get_booking_by_token", { p_token: token });
  if (error) throw new Error(error.message);
  const row = (data as DbManaged[] | null)?.[0];
  if (!row) return null;
  const start = new Date(row.start_at);
  return {
    bookingId: row.booking_id,
    status: row.status,
    startUtc: start.toISOString(),
    endUtc: new Date(row.end_at).toISOString(),
    localDate: dateInTimeZone(start, row.timezone),
    localTime: timeInTimeZone(start, row.timezone),
    priceClp: row.price_clp,
    clientName: row.client_name,
    serviceName: row.service_name,
    durationMin: row.duration_min,
    staffName: row.staff_name,
    businessName: row.business_name,
    businessSlug: row.business_slug,
    businessAddress: row.business_address ?? "",
    businessPhone: row.business_phone ?? "",
    businessCategory: row.business_category,
    brandColor: row.brand_color,
    timezone: row.timezone,
    canCancel: row.can_cancel,
  };
}

export async function cancelManagedBooking(token: string): Promise<CancelResult> {
  if (!manageTokenSchema.safeParse(token).success) return "NOT_FOUND";
  if (DEMO_MODE) return demoCancelByToken(token);
  const { data, error } = await privilegedDb().rpc("cancel_booking_by_token", { p_token: token });
  if (error) throw new Error(error.message);
  return data as CancelResult;
}
