import { NextRequest, NextResponse } from "next/server";
import { getPanelSession, listPanelBookings, listPanelStaff } from "@/lib/panel";
import { isIsoDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getPanelSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const businessId = searchParams.get("businessId") || "";
  const date = searchParams.get("date") || "";

  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const business = session.businesses.find((b) => b.id === businessId);
  if (!business) {
    return NextResponse.json({ error: "Negocio no encontrado o sin acceso" }, { status: 403 });
  }

  try {
    const [bookings, staff] = await Promise.all([
      listPanelBookings(business, date),
      listPanelStaff(business.id),
    ]);

    return NextResponse.json({ bookings, staff });
  } catch (error) {
    console.error("GET panel bookings error:", error);
    return NextResponse.json({ error: "Error al cargar la agenda" }, { status: 500 });
  }
}
