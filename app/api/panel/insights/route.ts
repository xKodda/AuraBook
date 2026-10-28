import { NextRequest, NextResponse } from "next/server";
import { daysInRange, isIsoDate } from "@/lib/dates";
import { getInsights } from "@/lib/insights";
import { getPanelSession } from "@/lib/panel";

export const dynamic = "force-dynamic";

/** Estadísticas del negocio entre `from` y `to` (fechas locales, ambos incluidos; máximo un año). Premium. */
export async function GET(request: NextRequest) {
  const session = await getPanelSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  if (!isIsoDate(from) || !isIsoDate(to) || from > to || daysInRange(from, to) > 366) {
    return NextResponse.json({ error: "Rango de fechas inválido (máximo un año)." }, { status: 400 });
  }
  const business = session.businesses.find((b) => b.id === params.get("businessId"));
  if (!business) return NextResponse.json({ error: "Negocio no encontrado o sin acceso" }, { status: 403 });
  const result = await getInsights(business, from, to);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
