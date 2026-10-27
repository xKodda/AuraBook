import { NextRequest, NextResponse } from "next/server";
import { createPanelBooking, getPanelSession, listPanelBookings, listPanelStaff } from "@/lib/panel";
import { listDayTimeOff } from "@/lib/time-off";
import { isIsoDate } from "@/lib/dates";
import { panelBookingSchema } from "@/lib/validation";

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
    const [bookings, staff, timeOff] = await Promise.all([
      listPanelBookings(business, date),
      listPanelStaff(business.id),
      listDayTimeOff(business, date),
    ]);

    return NextResponse.json({ bookings, staff, timeOff });
  } catch (error) {
    console.error("GET panel bookings error:", error);
    return NextResponse.json({ error: "Error al cargar la agenda" }, { status: 500 });
  }
}

const CREATE_ERRORS: Record<string, [string, number]> = {
  FORBIDDEN: ["No tienes permisos para agendar en la agenda de ese profesional.", 403],
  SLOT_TAKEN: ["Esa hora ya está ocupada. Elige otra o márcala como sobrecupo.", 409],
  INVALID_PHONE: ["Revisa el teléfono del cliente.", 400],
  INVALID_NAME: ["Revisa el nombre del cliente.", 400],
  SERVICE_NOT_FOUND: ["Ese servicio ya no está disponible.", 400],
  STAFF_NOT_FOUND: ["Ese profesional no ofrece el servicio elegido.", 400],
};

/** Reserva agregada desde el panel (cliente por teléfono, en persona o sobrecupo). */
export async function POST(request: NextRequest) {
  const session = await getPanelSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const parsed = panelBookingSchema.safeParse(body);
  if (!parsed.success || !isIsoDate(parsed.data.date)) {
    return NextResponse.json({ error: "Revisa los datos de la reserva." }, { status: 400 });
  }
  const { businessId, ...input } = parsed.data;
  const business = session.businesses.find((b) => b.id === businessId);
  if (!business) return NextResponse.json({ error: "Negocio no encontrado o sin acceso" }, { status: 403 });

  try {
    const result = await createPanelBooking(business, input);
    if (result === "OK") return NextResponse.json({ ok: true }, { status: 201 });
    const [error, status] = CREATE_ERRORS[result] ?? ["No se pudo crear la reserva.", 500];
    return NextResponse.json({ error, code: result }, { status });
  } catch (error) {
    console.error("POST panel booking:", error);
    return NextResponse.json({ error: "Error en el servidor." }, { status: 500 });
  }
}
