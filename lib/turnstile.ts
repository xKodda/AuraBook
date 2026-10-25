import "server-only";
import { DEMO_MODE, IS_PRODUCTION, TURNSTILE_SECRET_KEY } from "./env";

export type CaptchaResult = "ok" | "failed" | "not_configured";

/**
 * Verificación server-side de Cloudflare Turnstile.
 * - Con TURNSTILE_SECRET_KEY: siempre se verifica.
 * - Sin clave: se omite en demo/desarrollo; en producción real se rechaza (fail-closed).
 */
export async function verifyCaptcha(token: string | undefined, ip: string): Promise<CaptchaResult> {
  if (!TURNSTILE_SECRET_KEY) {
    return DEMO_MODE || !IS_PRODUCTION ? "ok" : "not_configured";
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
