"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { BUSINESS_COOKIE } from "@/lib/dashboard";
import { getPanelSession } from "@/lib/panel";

/** Cambia el negocio que se administra. Solo acepta negocios donde el usuario es miembro. */
export async function selectBusinessAction(businessId: string): Promise<void> {
  if (!z.uuid().safeParse(businessId).success) return;
  const session = await getPanelSession();
  if (!session?.businesses.some((b) => b.id === businessId)) return;
  (await cookies()).set(BUSINESS_COOKIE, businessId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
}
