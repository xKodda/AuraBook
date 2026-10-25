import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

function url(): string {
  if (!SUPABASE_URL) throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL");
  return SUPABASE_URL;
}

function anonKey(): string {
  if (!SUPABASE_ANON_KEY) throw new Error("Configura NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return SUPABASE_ANON_KEY;
}

/** Cliente anónimo sin sesión: solo catálogo público y disponibilidad. */
export function publicDb() {
  return createClient(url(), anonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Exclusivo del servidor. NUNCA exponer esta credencial en variables NEXT_PUBLIC_*.
export function privilegedDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cliente con la sesión del usuario (cookies). Respeta RLS como `authenticated`. */
export async function sessionDb() {
  const cookieStore = await cookies();
  return createServerClient(url(), anonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el proxy se encarga de refrescar la sesión.
        }
      },
    },
  });
}
