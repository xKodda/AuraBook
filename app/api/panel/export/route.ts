import { NextRequest, NextResponse } from "next/server";
import { bookingsCsv, clientsCsv } from "@/lib/account";
import { dateInTimeZone } from "@/lib/dates";
import { getPanelSession } from "@/lib/panel";
import { canViewAllBookings } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Descarga de datos del negocio en CSV (owner/admin): reservas o clientes. */
export async function GET(request: NextRequest) {
  const session = await getPanelSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const type = params.get("tipo");
  const business = session.businesses.find((b) => b.id === params.get("businessId"));
  if (!business || !canViewAllBookings(business.role)) {
    return NextResponse.json({ error: "No tienes acceso a los datos de este negocio." }, { status: 403 });
  }
  if (type !== "reservas" && type !== "clientes") {
    return NextResponse.json({ error: "Tipo de exportación inválido." }, { status: 400 });
  }

  try {
    const csv = type === "reservas" ? await bookingsCsv(business) : await clientsCsv(business);
    const file = `${business.slug}-${type}-${dateInTimeZone(new Date(), business.timezone)}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET export:", error);
    return NextResponse.json({ error: "No se pudo generar el archivo." }, { status: 500 });
  }
}
