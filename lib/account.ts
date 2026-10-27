import "server-only";
import { csvPhone, toCsv } from "./csv";
import { dateInTimeZone, timeInTimeZone } from "./dates";
import { DEMO_MODE, demoExportRows } from "./demo";
import { sessionDb } from "./supabase";
import type { BookingStatus, PanelBusiness } from "./types";

type ExportRow = {
  start_at: string;
  end_at: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  price_clp: number;
  status: BookingStatus;
  source: "web" | "panel";
  is_overbook: boolean;
  notes: string | null;
  services: { name: string } | null;
  staff: { name: string } | null;
};

const STATUS: Record<BookingStatus, string> = {
  confirmed: "Confirmada", completed: "Completada", no_show: "No asistió", cancelled: "Cancelada",
};
const PAGE = 1000;
const MAX_ROWS = 50_000;

/** Todas las reservas del negocio (RLS: owner/admin ven todo). Se leen en páginas de 1.000. */
async function allBookings(business: PanelBusiness): Promise<ExportRow[]> {
  if (DEMO_MODE) return demoExportRows(business.id).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const db = await sessionDb();
  const rows: ExportRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db.from("bookings")
      .select("start_at,end_at,client_name,client_phone,client_email,price_clp,status,source,is_overbook,notes,services(name),staff(name)")
      .eq("business_id", business.id).order("start_at").order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`No se pudieron leer las reservas: ${error.message}`);
    rows.push(...((data ?? []) as unknown as ExportRow[]));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export async function bookingsCsv(business: PanelBusiness): Promise<string> {
  const tz = business.timezone;
  const rows = await allBookings(business);
  return toCsv(
    ["Fecha", "Hora inicio", "Hora término", "Cliente", "Teléfono", "Correo", "Servicio", "Profesional", "Precio (CLP)", "Estado", "Origen", "Sobrecupo", "Nota"],
    rows.map((r) => [
      dateInTimeZone(new Date(r.start_at), tz), timeInTimeZone(new Date(r.start_at), tz), timeInTimeZone(new Date(r.end_at), tz),
      r.client_name, csvPhone(r.client_phone), r.client_email, r.services?.name ?? "", r.staff?.name ?? "", r.price_clp,
      STATUS[r.status], r.source === "web" ? "Página de reservas" : "Panel", r.is_overbook, r.notes,
    ]),
  );
}

/** Un cliente por teléfono, con su historial resumido (sin crear una tabla de clientes). */
export async function clientsCsv(business: PanelBusiness): Promise<string> {
  const tz = business.timezone;
  const rows = await allBookings(business);
  type Client = { name: string; phone: string; email: string | null; total: number; attended: number; noShow: number; cancelled: number; last: string };
  const clients = new Map<string, Client>();
  for (const r of rows) {
    const key = r.client_phone.replace(/\D/g, "");
    const c = clients.get(key) ?? { name: r.client_name, phone: r.client_phone, email: null, total: 0, attended: 0, noShow: 0, cancelled: 0, last: "" };
    // Las filas vienen en orden de fecha: el nombre y el correo quedan con el dato más reciente.
    c.name = r.client_name;
    c.email = r.client_email ?? c.email;
    c.total += 1;
    if (r.status === "completed") c.attended += 1;
    if (r.status === "no_show") c.noShow += 1;
    if (r.status === "cancelled") c.cancelled += 1;
    c.last = dateInTimeZone(new Date(r.start_at), tz);
    clients.set(key, c);
  }
  return toCsv(
    ["Nombre", "Teléfono", "Correo", "Reservas", "Asistió", "No asistió", "Canceladas", "Última reserva"],
    [...clients.values()].sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((c) => [c.name, csvPhone(c.phone), c.email, c.total, c.attended, c.noShow, c.cancelled, c.last]),
  );
}
