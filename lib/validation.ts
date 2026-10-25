import { z } from "zod";

export const bookingSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  serviceId: z.uuid(),
  staffId: z.uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+?[\d\s-]{8,20}$/),
  captchaToken: z.string().max(4096).optional(),
});

export function isValidChileanPhoneOrInternational(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export const uuidSchema = z.uuid();

export const manageTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const emailSchema = z.email().max(254);
