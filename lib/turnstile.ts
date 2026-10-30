import "server-only";
import { captchaConfigProblem, captchaMode } from "./captcha-config";
import { TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY } from "./env";
import { safeError } from "./log-safe";

export type CaptchaResult = "ok" | "failed" | "misconfigured";

/** Estado de Turnstile en este despliegue (también lo muestra /admin). */
export const CAPTCHA_MODE = captchaMode(TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY);

let warned = false;

/**
 * Verificación server-side de Cloudflare Turnstile.
 * - "enforced": el token es obligatorio y se verifica con Cloudflare.
 * - "disabled": se omite; las reservas siguen protegidas por el límite por IP (8 / 10 min) y el máximo de reservas
 *   activas por teléfono.
 * - "misconfigured": no se puede verificar y NO se desactiva la protección: se responde "misconfigured" (la API lo
 *   informa explícitamente) y se registra como error en cada intento. El build de producción ya falla en este caso
 *   (next.config.ts), así que solo ocurre si se cambia una variable sin volver a desplegar.
 */
export async function verifyCaptcha(token: string | undefined, ip: string): Promise<CaptchaResult> {
  if (CAPTCHA_MODE === "misconfigured") {
    console.error(captchaConfigProblem(TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY));
    return "misconfigured";
  }
  if (CAPTCHA_MODE === "disabled") {
    if (!warned && process.env.NODE_ENV === "production") {
      warned = true;
      console.warn("Turnstile no configurado: reservas protegidas solo por límites de intentos.");
    }
    return "ok";
  }
  if (!token) return "failed";
  try {
    const body = new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token });
    if (ip !== "unknown") body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true ? "ok" : "failed";
  } catch (error) {
    console.error("verifyCaptcha:", safeError(error));
    return "failed";
  }
}
