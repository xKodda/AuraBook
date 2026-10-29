import { z } from "zod";

// Caracteres de control e invisibles (ancho cero, cambios de dirección de texto): se usan para engañar o romper vistas.
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;
// Un nombre no lleva HTML ni enlaces: evita usar la reserva para enviar spam o phishing en los avisos al negocio.
const LINK_OR_HTML = /[<>]|https?:|www\.|\.(com|cl|net|org|io|xyz|ru|info|ly|me)\b/i;

/** Nombre de una persona (cliente de una reserva). Acepta tildes, ñ, apóstrofos y guiones. */
export const personNameSchema = z.string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(2).max(80)
    .refine((v) => !INVISIBLE.test(v), "Nombre con caracteres no permitidos")
    .refine((v) => !LINK_OR_HTML.test(v), "Nombre con enlaces o HTML")
    .refine((v) => /\p{L}/u.test(v), "El nombre debe tener letras"));

export const bookingSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  serviceId: z.uuid(),
  staffId: z.uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  name: personNameSchema,
  phone: z.string().trim().regex(/^\+?[\d\s-]{8,20}$/),
  // Opcionales: sin correo no hay confirmación ni recordatorio por correo.
  email: z.union([z.literal(""), z.email().max(254)]).optional().transform((e) => e || null),
  reminder: z.boolean().optional().default(false),
  captchaToken: z.string().max(4096).optional(),
});

export function isValidChileanPhoneOrInternational(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export const uuidSchema = z.uuid();

/** Reserva que el equipo agrega desde el panel (por teléfono, en persona o como sobrecupo). */
export const panelBookingSchema = z.object({
  businessId: z.uuid(),
  serviceId: z.uuid(),
  staffId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  name: personNameSchema,
  phone: z.string().trim().regex(/^\+?[\d\s-]{8,20}$/),
  notes: z.string().trim().max(500).optional().default(""),
  overbook: z.boolean().optional().default(false),
});

export const manageTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const emailSchema = z.email().max(254);
