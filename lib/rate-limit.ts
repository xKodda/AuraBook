import "server-only";
import { DEMO_MODE } from "./env";
import { privilegedDb } from "./supabase";

type Bucket = { window: number; hits: number };

declare global {
  var __clikiumRateLimits: Map<string, Bucket> | undefined;
}

function memoryHit(key: string, limit: number, windowSeconds: number): boolean {
  const store = (globalThis.__clikiumRateLimits ??= new Map());
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const bucket = store.get(key);
  if (!bucket || bucket.window !== window) {
    store.set(key, { window, hits: 1 });
    if (store.size > 5000) store.clear();
    return true;
  }
  bucket.hits += 1;
  return bucket.hits <= limit;
}

/**
 * Ventana fija persistente en Postgres (comparte estado entre instancias serverless).
 * Devuelve true si la solicitud está permitida. Si la DB falla, se permite (fail-open)
 * para no bloquear reservas legítimas; Turnstile sigue protegiendo el endpoint.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (DEMO_MODE) return memoryHit(key, limit, windowSeconds);
  try {
    const { data, error } = await privilegedDb().rpc("hit_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("rateLimit:", error.message);
      return true;
    }
    return data === true;
  } catch (error) {
    // Falta SUPABASE_SERVICE_ROLE_KEY: se degrada a memoria en vez de romper la página.
    console.error("rateLimit:", error instanceof Error ? error.message : error);
    return memoryHit(key, limit, windowSeconds);
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
