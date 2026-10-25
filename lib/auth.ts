import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { SITE_URL } from "./env";
import { sessionDb } from "./supabase";

/** Usuario autenticado validado contra Supabase Auth (no solo la cookie). */
export async function currentUser(): Promise<User | null> {
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  return user;
}

export async function requireUser(nextPath: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/**
 * Origen para los enlaces de los correos. SITE_URL en producción; en desarrollo, el host de la solicitud.
 * Supabase igualmente rechaza cualquier URL que no esté en su lista de Redirect URLs.
 */
export async function siteOrigin(): Promise<string> {
  if (SITE_URL) return SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
