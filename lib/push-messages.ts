// Textos de los avisos push al equipo. Funciones puras (se prueban sin servidor).
// El contenido viaja cifrado de punta a punta hasta el navegador: el servicio de push (Google, Apple, Mozilla) no lo lee.
import { formatWhen, type BookingEmailData } from "./email-templates";

export type PushMessage = { title: string; body: string; url: string; tag: string };

type PushBooking = Pick<BookingEmailData, "startAt" | "timezone" | "clientName" | "serviceName" | "staffName" | "businessName">;

// Las notificaciones muestran poco texto: se recorta para que el nombre no se coma la hora.
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/** Reserva nueva desde la página pública. `tag` distinto por reserva: dos reservas seguidas no se pisan. */
export function newBookingPush(bookingId: string, b: PushBooking): PushMessage {
  return {
    title: `Nueva reserva · ${clip(b.businessName, 40)}`,
    body: `${clip(b.clientName, 40)} · ${clip(b.serviceName, 40)}\n${formatWhen(b.startAt, b.timezone)} · con ${clip(b.staffName, 30)}`,
    url: "/dashboard",
    tag: `booking-${bookingId}`,
  };
}

/** Aviso de prueba al activar los avisos en un teléfono. */
export const TEST_PUSH: PushMessage = {
  title: "Avisos activados ✓",
  body: "Así te avisaremos en este teléfono cada vez que alguien reserve o cancele.",
  url: "/dashboard",
  tag: "aurabook-test",
};

/** El cliente canceló desde su enlace. Usa el mismo `tag`: reemplaza el aviso de la reserva si sigue en pantalla. */
export function cancellationPush(bookingId: string, b: PushBooking): PushMessage {
  return {
    title: `Reserva cancelada · ${clip(b.businessName, 40)}`,
    body: `${clip(b.clientName, 40)} canceló ${clip(b.serviceName, 40)}\n${formatWhen(b.startAt, b.timezone)} · la hora quedó libre`,
    url: "/dashboard",
    tag: `booking-${bookingId}`,
  };
}
