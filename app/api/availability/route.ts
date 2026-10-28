import { NextRequest, NextResponse } from "next/server";
import { DEMO_MODE, demoAvailability } from "@/lib/demo";
import { dateWithinBookingWindow } from "@/lib/dates";
import { publicDb } from "@/lib/supabase";
import { getBusiness } from "@/lib/business";
import type { AvailableSlot } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const slug = params.get("slug") || "";
  const serviceId = params.get("serviceId") || "";
  const date = params.get("date") || "";
  const staffParam = params.get("staffId");
  const staffId = staffParam && staffParam !== "any" ? staffParam : null;
  if (!/^[a-z0-9-]{3,60}$/.test(slug) || !UUID.test(serviceId) || (staffId !== null && !UUID.test(staffId))) {
    return json({ error: "Parámetros inválidos." }, 400);
  }
  try {
    const business = await getBusiness(slug);
    if (!business) return json({ error: "Negocio no encontrado." }, 404);
    if (!dateWithinBookingWindow(date, business.timezone, business.maxDaysAhead)) {
      return json({ error: `Solo puedes reservar dentro de los próximos ${business.maxDaysAhead} días.` }, 400);
    }
    if (!business.services.some((s) => s.id === serviceId)) {
      return json({ error: "Servicio no disponible." }, 400);
    }
    if (staffId && !business.staff.some((m) => m.id === staffId && m.serviceIds.includes(serviceId))) {
      return json({ error: "Ese profesional no ofrece el servicio." }, 400);
    }
    if (DEMO_MODE) return json({ slots: demoAvailability(business, serviceId, date, staffId), demo: true });
    const { data, error } = await publicDb().rpc("available_slots", {
      p_slug: slug,
      p_service_id: serviceId,
      p_date: date,
      p_staff_id: staffId,
    });
    if (error) throw new Error(error.message);
    const slots: AvailableSlot[] = (data ?? []).map((item: {
      staff_id: string; staff_name: string; slot_time: string;
    }) => ({ staffId: item.staff_id, staffName: item.staff_name, time: item.slot_time }));
    // Sin horas: avisar si es porque el mes ya tiene completa la cuota del plan Free.
    const monthFull = slots.length === 0
      && (await publicDb().rpc("public_month_full", { p_slug: slug, p_day: date })).data === true;
    return json({ slots, monthFull, demo: false });
  } catch (error) {
    console.error("GET availability:", error);
    return json({ error: "No se pudieron consultar los horarios. Intenta nuevamente." }, 503);
  }
}
