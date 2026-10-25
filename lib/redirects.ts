/**
 * Devuelve `next` solo si es una ruta interna ("/panel", "/onboarding?paso=2").
 * Evita redirecciones abiertas tipo `?next=https://sitio-malicioso.cl` o `?next=//sitio.cl`.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  try {
    const url = new URL(next, "http://aurabook.local");
    if (url.origin !== "http://aurabook.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
