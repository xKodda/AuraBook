import { NextRequest, NextResponse } from "next/server";
import { daysInRange, isIsoDate } from "@/lib/dates";
import { getPanelRevenue, getPanelSession } from "@/lib/panel";
import { safeError } from "@/lib/log-safe";

export const dynamic = "force-dynamic";

/** Ingresos por día entre `from` y `to` (fechas locales del negocio, ambos incluidos; máximo un año). */
export async function GET(request: NextRequest) {
  const session = await getPanelSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const businessId = params.get("businessId") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  if (!isIsoDate(from) || !isIsoDate(to) || from > to || daysInRange(from, to) > 366) {
    return NextResponse.json({ error: "Rango de fechas inválido (máximo un año)." }, { status: 400 });
  }

  const business = session.businesses.find((b) => b.id === businessId);
  if (!business) return NextResponse.json({ error: "Negocio no encontrado o sin acceso" }, { status: 403 });

  try {
    return NextResponse.json({ days: await getPanelRevenue(business, from, to) });
  } catch (error) {
    console.error("GET panel revenue:", safeError(error));
    return NextResponse.json({ error: "No se pudieron calcular los ingresos." }, { status: 500 });
  }
}
