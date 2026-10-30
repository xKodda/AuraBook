import { after, NextResponse } from "next/server";
import { DEMO_MODE, demoCreateBooking } from "@/lib/demo";
import { getBusiness } from "@/lib/business";
import { dateWithinBookingWindow } from "@/lib/dates";
import { notifyNewBooking } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { privilegedDb } from "@/lib/supabase";
import { verifyCaptcha } from "@/lib/turnstile";
import { bookingSchema, isValidChileanPhoneOrInternational } from "@/lib/validation";
import { safeError } from "@/lib/log-safe";

export const dynamic = "force-dynamic";

const errorJson = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });

const TOO_MANY = "Ya tienes varias reservas activas en este local. Cancela una antes de agendar otra.";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);

  // 1) Límite por IP antes de cualquier trabajo costoso: 8 intentos / 10 min.
  if (!(await rateLimit(`booking:ip:${ip}`, 8, 600))) {
    return errorJson("Demasiados intentos. Espera unos minutos y vuelve a intentar.", 429, "RATE_LIMITED");
  }

  let raw: unknown;
  try {
    if (Number(request.headers.get("content-length") ?? "0") > 8192) return errorJson("Solicitud demasiado grande.", 413);
    raw = await request.json();
  } catch {
    return errorJson("Solicitud JSON inválida.", 400);
  }
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success || !isValidChileanPhoneOrInternational(parsed.data.phone)) {
    return errorJson("Revisa tu nombre (solo letras, sin enlaces), teléfono, correo y los datos de la reserva.", 400);
  }
  const { captchaToken, email, reminder, ...data } = parsed.data;

  // 2) CAPTCHA verificado en servidor.
  const captcha = await verifyCaptcha(captchaToken, ip);
  if (captcha === "misconfigured") {
    // Configuración incompleta de Turnstile: no se puede verificar y no se omite la protección. Error explícito (503),
    // no un «no eres una persona», para que se note y se corrija (también aparece en /admin y en los logs).
    return errorJson("Las reservas online no están disponibles en este momento. Contacta directamente al local.", 503,
      "CAPTCHA_MISCONFIGURED");
  }
  if (captcha === "failed") {
    return errorJson("No pudimos verificar que eres una persona. Intenta nuevamente.", 400, "CAPTCHA_FAILED");
  }

  try {
    const business = await getBusiness(data.slug);
    if (!business) return errorJson("Negocio no encontrado.", 404);
    if (!dateWithinBookingWindow(data.date, business.timezone, business.maxDaysAhead)) {
      return errorJson(`Fecha fuera de rango. Solo se permiten reservas dentro de ${business.maxDaysAhead} días.`, 400);
    }
    if (!business.services.some((s) => s.id === data.serviceId)) {
      return errorJson("Servicio no disponible.", 400);
    }
    if (data.staffId && !business.staff.some((m) => m.id === data.staffId && m.serviceIds.includes(data.serviceId))) {
      return errorJson("Profesional no disponible para este servicio.", 400);
    }

    if (DEMO_MODE) {
      const result = demoCreateBooking(business, data);
      if (!result.ok) {
        return result.reason === "TOO_MANY_BOOKINGS"
          ? errorJson(TOO_MANY, 409, "TOO_MANY_BOOKINGS")
          : errorJson("Ese horario ya no está disponible. Elige otro.", 409, "SLOT_UNAVAILABLE");
      }
      return NextResponse.json(result.booking, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    const { data: saved, error } = await privilegedDb().rpc("create_public_booking", {
      p_slug: data.slug,
      p_service_id: data.serviceId,
      p_staff_id: data.staffId,
      p_date: data.date,
      p_time: data.time,
      p_client_name: data.name,
      p_client_phone: data.phone,
    });
    if (error) {
      if (error.message.includes("SLOT_UNAVAILABLE") || error.code === "23P01") {
        return errorJson("Ese horario ya no está disponible. Elige otro.", 409, "SLOT_UNAVAILABLE");
      }
      if (error.message.includes("TOO_MANY_BOOKINGS")) return errorJson(TOO_MANY, 409, "TOO_MANY_BOOKINGS");
      if (error.message.includes("CLIENT_BLOCKED")) {
        return errorJson("No es posible reservar online con este teléfono. Comunícate directamente con el local para agendar.", 403, "CLIENT_BLOCKED");
      }
      if (error.message.includes("MONTHLY_LIMIT_REACHED")) {
        return errorJson("Este negocio no está recibiendo más reservas online para ese mes. Contáctalo directamente.", 409, "MONTHLY_LIMIT_REACHED");
      }
      if (error.message.includes("INVALID_BOOKING") || error.message.includes("INVALID_NAME")) return errorJson("Datos de reserva inválidos.", 400);
      throw new Error(error.message);
    }
    const row = saved?.[0] as {
      booking_id: string; public_token: string; assigned_staff_id: string; assigned_staff_name: string; slot_time: string;
    } | undefined;
    if (!row) return errorJson("No se pudo confirmar este horario.", 409);

    // La reserva ya existe: el correo y los avisos no deben hacerla fallar.
    if (email) {
      const { error: contactError } = await privilegedDb().rpc("set_public_booking_contact", {
        p_booking_id: row.booking_id, p_email: email, p_reminder: reminder,
      });
      if (contactError) console.error("set_public_booking_contact:", contactError.message);
    }
    after(() => notifyNewBooking(row.booking_id));

    return NextResponse.json({
      bookingId: row.booking_id,
      manageToken: row.public_token,
      assignedStaffId: row.assigned_staff_id,
      assignedStaffName: row.assigned_staff_name,
      time: row.slot_time,
      demo: false,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("POST booking:", safeError(error));
    return errorJson("No fue posible confirmar la reserva. Intenta más tarde.", 503);
  }
}
