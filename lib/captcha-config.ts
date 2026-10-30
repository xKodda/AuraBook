// Estado de la configuración de Cloudflare Turnstile (auditoría P1-06). Sin dependencias: lo usan next.config.ts
// (para que un build con la configuración a medias falle), el servidor y /admin.
//
// - "enforced": las dos claves → el formulario muestra el captcha y el servidor lo exige.
// - "disabled": ninguna clave → sin captcha; las reservas quedan protegidas solo por límites de intentos.
// - "misconfigured": una sola clave → no se puede verificar. Antes, con solo la secreta, se rechazaban en silencio
//   todas las reservas; con solo la pública, el captcha se mostraba pero nadie lo verificaba.
export type CaptchaMode = "enforced" | "disabled" | "misconfigured";

export function captchaMode(siteKey: string | undefined, secretKey: string | undefined): CaptchaMode {
  const site = Boolean(siteKey?.trim());
  const secret = Boolean(secretKey?.trim());
  if (site && secret) return "enforced";
  if (!site && !secret) return "disabled";
  return "misconfigured";
}

/** Mensaje para el build y los logs cuando falta una de las dos claves (sin mostrar sus valores). */
export function captchaConfigProblem(siteKey: string | undefined, secretKey: string | undefined): string | null {
  if (captchaMode(siteKey, secretKey) !== "misconfigured") return null;
  const missing = siteKey?.trim() ? "TURNSTILE_SECRET_KEY" : "NEXT_PUBLIC_TURNSTILE_SITE_KEY";
  return `Turnstile a medias: falta ${missing}. Configura las dos claves (NEXT_PUBLIC_TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY) o ninguna.`;
}
