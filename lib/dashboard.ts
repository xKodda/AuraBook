import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "./billing-server";
import { getPanelSession, type PanelSession } from "./panel";
import type { PanelBusiness } from "./types";

export const BUSINESS_COOKIE = "aurabook_negocio";

export type DashboardContext = {
  session: PanelSession;
  /** Negocios publicados donde el usuario es miembro. */
  businesses: PanelBusiness[];
  /** Negocio que se está administrando (cookie, o el primero). */
  business: PanelBusiness;
  pendingOnboarding: boolean;
  platformAdmin: boolean;
};

/**
 * Contexto del panel, compartido por el layout y cada sección (una sola consulta por solicitud).
 * Redirige a login u onboarding cuando corresponde; null = sin negocios publicados ni pendientes propios.
 */
export const getDashboardContext = cache(async (): Promise<DashboardContext | null> => {
  const session = await getPanelSession();
  if (!session) redirect("/login?next=/dashboard");
  const businesses = session.businesses.filter((b) => b.published);
  const pendingOnboarding = session.businesses.some((b) => !b.published && b.role === "owner");
  if (businesses.length === 0) {
    if (pendingOnboarding || session.businesses.length === 0) redirect("/onboarding");
    return null;
  }
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  const business = businesses.find((b) => b.id === chosen) ?? businesses[0];
  return { session, businesses, business, pendingOnboarding, platformAdmin: await isPlatformAdmin() };
});

/** Para secciones de gestión: exige owner/admin (o owner solo, si `ownerOnly`). */
export async function requireManager(ownerOnly = false): Promise<DashboardContext> {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/dashboard");
  const allowed = ownerOnly ? ctx.business.role === "owner" : ctx.business.role !== "staff";
  if (!allowed) redirect("/dashboard");
  return ctx;
}
