// Configuración de entorno compartida (server + proxy). No importar desde componentes cliente.

export const DEMO_MODE =
  process.env.DEMO_MODE === "true" ||
  (process.env.NODE_ENV === "development" && process.env.DEMO_MODE !== "false");

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Acepta la clave nueva (sb_publishable_…) o la legacy (anon). `||` y no `??`: una variable vacía no debe ganar.
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? "";

/** URL pública canónica (ej. https://aurabook.cl), sin barra final. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

/** Contacto que ven los dueños en «Mi plan» para pagar o cambiar de plan. */
export const BILLING_CONTACT_EMAIL = process.env.NEXT_PUBLIC_BILLING_CONTACT_EMAIL ?? "";
export const BILLING_CONTACT_WHATSAPP = (process.env.NEXT_PUBLIC_BILLING_CONTACT_WHATSAPP ?? "").replace(/\D/g, "");


/** Origen público para enlaces absolutos (sitemap, Open Graph). */
export const PUBLIC_ORIGIN = SITE_URL || "https://aurabook.clikium.cl";
