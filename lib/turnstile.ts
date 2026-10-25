import "server-only";
import { TURNSTILE_SECRET_KEY } from "./env";

export type CaptchaResult = "ok" | "failed";

let warned = false;

/**
 * Verificación server-side de Cloudflare Turnstile.
 * - Con TURNSTILE_SECRET_KEY: el token es obligatorio y se verifica con Cloudflare.
 * - Sin clave: se omite. Las reservas siguen protegidas por el límite por IP (8 / 10 min)
 *   y el máximo de reservas activas por teléfono. Recomendado activarlo al abrir a público masivo.
 */
export async function verifyCaptcha(token: string | undefined, ip: string): Promise<CaptchaResult> {
  if (!TURNSTILE_SECRET_KEY) {
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
    console.error("verifyCaptcha:", error);
    return "failed";
  }
}
