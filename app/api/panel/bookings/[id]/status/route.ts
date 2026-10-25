import { NextRequest, NextResponse } from "next/server";
import { setPanelBookingStatus } from "@/lib/panel";
import type { BookingStatus } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const VALID_STATUSES: BookingStatus[] = ["confirmed", "completed", "no_show", "cancelled"];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const { businessId, status } = (body ?? {}) as { businessId?: string; status?: BookingStatus };
  if (
    !uuidSchema.safeParse(id).success || !uuidSchema.safeParse(businessId).success ||
    !status || !VALID_STATUSES.includes(status)
  ) {
    return NextResponse.json({ error: "Datos de estado inválidos" }, { status: 400 });
  }

  try {
    const result = await setPanelBookingStatus(businessId!, id, status);
    if (result === "OK") {
      return NextResponse.json({ ok: true, status });
    }
    if (result === "FORBIDDEN") {
      return NextResponse.json({ error: "No tienes permisos para modificar esta reserva." }, { status: 403 });
    }
    if (result === "SLOT_TAKEN") {
      return NextResponse.json({ error: "El horario ya fue ocupado por otra reserva." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo actualizar la reserva." }, { status: 500 });
  } catch (error) {
    console.error("POST panel booking status:", error);
    return NextResponse.json({ error: "Error en el servidor." }, { status: 500 });
  }
}
