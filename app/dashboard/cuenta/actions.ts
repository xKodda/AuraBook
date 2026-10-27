"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BUSINESS_COOKIE, getDashboardContext } from "@/lib/dashboard";
import { DEMO_MODE } from "@/lib/env";
import { rpcErrorMessage } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { privilegedDb, publicDb, sessionDb } from "@/lib/supabase";

export type AccountResult = { ok: true; message: string } | { ok: false; error: string };

const DEMO: AccountResult = { ok: false, error: "En el modo demo no hay cuentas reales." };
const LOGO_BUCKET = "business-logos";

/** Cambia la contraseña verificando primero la actual (sin tocar la sesión abierta). */
export async function changePasswordAction(input: { current: string; next: string; confirm: string }): Promise<AccountResult> {
  if (DEMO_MODE) return DEMO;
  const next = z.string().min(8).max(72).safeParse(input.next);
  if (!next.success) return { ok: false, error: "La nueva contraseña debe tener al menos 8 caracteres." };
  if (input.next !== input.confirm) return { ok: false, error: "Las contraseñas nuevas no coinciden." };

  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) return { ok: false, error: rpcErrorMessage("UNAUTHENTICATED") };
  if (!(await rateLimit(`password:user:${user.id}`, 5, 900))) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos." };
  }
  // Cliente aparte, sin cookies: comprobar la contraseña actual no reemplaza la sesión del panel.
  const check = await publicDb().auth.signInWithPassword({ email: user.email, password: input.current });
  if (check.error) return { ok: false, error: "La contraseña actual no es correcta." };

  const { error } = await db.auth.updateUser({ password: next.data });
  if (error) {
    console.error("updateUser:", error.code, error.message);
    return {
      ok: false,
      error: error.code === "same_password" ? "La nueva contraseña debe ser distinta de la actual." : "No pudimos cambiar la contraseña.",
    };
  }
  return { ok: true, message: "Contraseña actualizada." };
}

/**
 * Elimina el negocio que se administra (solo el dueño, escribiendo su enlace). Si era su último negocio,
 * también se elimina la cuenta de acceso. La facturación se conserva anonimizada (migración 20261106000000).
 */
export async function deleteBusinessAction(confirmSlug: string): Promise<AccountResult> {
  if (DEMO_MODE) return DEMO;
  const ctx = await getDashboardContext();
  if (!ctx || ctx.business.role !== "owner") return { ok: false, error: rpcErrorMessage("FORBIDDEN") };
  const businessId = ctx.business.id;

  const db = await sessionDb();
  const { data, error } = await db.rpc("delete_business", { p_business_id: businessId, p_confirm_slug: confirmSlug });
  if (error) return { ok: false, error: rpcErrorMessage(error.message) };
  const result = data as { logoUrl: string | null; remainingBusinesses: number };

  const admin = privilegedDb();
  // Logo: se borra la carpeta del negocio en Storage (si falla, solo se registra).
  const { data: files } = await admin.storage.from(LOGO_BUCKET).list(businessId);
  if (files?.length) {
    const { error: storageError } = await admin.storage.from(LOGO_BUCKET).remove(files.map((f) => `${businessId}/${f.name}`));
    if (storageError) console.error("delete logo:", storageError.message);
  }

  (await cookies()).delete(BUSINESS_COOKIE);
  if (result.remainingBusinesses > 0) redirect("/dashboard");

  // Era su último negocio: se elimina también la cuenta de acceso.
  const userId = ctx.session.userId;
  await db.auth.signOut();
  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) console.error("deleteUser:", userError.message);
  redirect("/cuenta/eliminada");
}
