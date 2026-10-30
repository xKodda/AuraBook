// Configuración de entorno compartida (server + proxy). No importar desde componentes cliente.
import { CANONICAL_ORIGIN } from "./domains";

export const DEMO_MODE =
  process.env.DEMO_MODE === "true" ||
  (process.env.NODE_ENV === "development" && process.env.DEMO_MODE !== "false");

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Acepta la clave nueva (sb_publishable_…) o la legacy (anon). `||` y no `??`: una variable vacía no debe ganar.
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? "";

/** URL pública canónica (https://aurabook.cl, ver lib/domains.ts), sin barra final. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

/** Contacto que ven los dueños en «Mi plan» para pagar o cambiar de plan. */
export const BILLING_CONTACT_EMAIL = process.env.NEXT_PUBLIC_BILLING_CONTACT_EMAIL ?? "";
export const BILLING_CONTACT_WHATSAPP = (process.env.NEXT_PUBLIC_BILLING_CONTACT_WHATSAPP ?? "").replace(/\D/g, "");

/**
 * Datos para pagar Premium por transferencia («Contratar Premium»). Solo servidor. Sin banco ni número de cuenta,
 * la página pide escribir a contacto para recibirlos.
 */
export const BANK_TRANSFER = {
  holder: process.env.BILLING_BANK_HOLDER || "Clikium SpA",
  rut: process.env.BILLING_BANK_RUT || "78.399.278-7",
  bank: process.env.BILLING_BANK_NAME ?? "",
  accountType: process.env.BILLING_BANK_ACCOUNT_TYPE ?? "",
  accountNumber: process.env.BILLING_BANK_ACCOUNT_NUMBER ?? "",
  email: process.env.BILLING_BANK_EMAIL || "contacto@clikium.cl",
};

/** A quién avisar cuando un negocio informa una transferencia. */
export const BILLING_NOTIFY_EMAIL = process.env.BILLING_NOTIFY_EMAIL || "contacto@clikium.cl";

/** A quién avisar cuando un negocio nuevo publica su página (por defecto, el mismo correo de pagos). */
export const PLATFORM_NOTIFY_EMAIL = process.env.PLATFORM_NOTIFY_EMAIL || BILLING_NOTIFY_EMAIL;

/**
 * Avisos push al teléfono (Web Push). Se generan con `npx web-push generate-vapid-keys`. La pública la recibe el
 * navegador para suscribirse; la privada firma los envíos y nunca sale del servidor. Sin las dos, no hay push.
 */
export const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
export const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contacto@clikium.cl";


/** Origen público para enlaces absolutos (sitemap, Open Graph). */
export const PUBLIC_ORIGIN = SITE_URL || CANONICAL_ORIGIN;
