import { after, NextRequest, NextResponse } from "next/server";
import { cancelManagedBooking, getManagedBooking } from "@/lib/bookings";
import { DEMO_MODE } from "@/lib/demo";
import { notifyClientCancellation } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { manageTokenSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!manageTokenSchema.safeParse(token).success) {
    return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  if (!(await rateLimit(`cancel:ip:${ip}`, 10, 600))) {
    return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });
  }

  try {
    const existing = await getManagedBooking(token);
    if (!existing) {
      return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });
    }

    const result = await cancelManagedBooking(token);
    if (result === "CANCELLED") {
      // El correo al dueño se envía después de responder: el cliente no espera por él.
      if (!DEMO_MODE) after(() => notifyClientCancellation(existing.bookingId));
      return NextResponse.json({ ok: true, status: "cancelled" });
    }
    if (result === "TOO_LATE") {
      return NextResponse.json(
        { error: "El plazo para cancelar online ha vencido. Comunícate directamente con el local." },
        { status: 400 },
      );
    }
    if (result === "NOT_CANCELLABLE") {
      return NextResponse.json({ error: "Esta reserva ya no está activa." }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo cancelar la reserva." }, { status: 400 });
  } catch (error) {
    console.error("POST cancel booking:", error);
    return NextResponse.json({ error: "Error al procesar la cancelación." }, { status: 500 });
  }
}
