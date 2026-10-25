"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, CalendarDays, CheckCircle2, MapPin, MessageCircle, XCircle } from "lucide-react";
import { calendarStamp, formatDate, formatPrice } from "@/lib/dates";
import { brandStyle } from "@/lib/theme";
import { AuraMark } from "./aura-mark";
import { BusinessLogo } from "./business-logo";
import type { ManagedBooking } from "@/lib/types";

type Props = {
  initialBooking: ManagedBooking;
  token: string;
};

export function ManagedBookingView({ initialBooking, token }: Props) {
  const [booking, setBooking] = useState<ManagedBooking>(initialBooking);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const brandVars = useMemo(() => brandStyle(booking.brandColor), [booking.brandColor]);

  // Google Calendar URL
  const googleCalUrl = useMemo(() => {
    const title = encodeURIComponent(`${booking.serviceName} en ${booking.businessName}`);
    const details = encodeURIComponent(
      `Cita con ${booking.staffName}. Local: ${booking.businessName}. ${booking.businessAddress}`,
    );
    const location = encodeURIComponent(booking.businessAddress);
    const start = calendarStamp(booking.startUtc);
    const end = calendarStamp(booking.endUtc);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`;
  }, [booking]);

  // Descarga archivo .ics para Apple Calendar / Outlook
  function downloadIcs() {
    const start = calendarStamp(booking.startUtc);
    const end = calendarStamp(booking.endUtc);
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AuraBook//Reservas//ES",
      "BEGIN:VEVENT",
      `UID:${booking.bookingId}@aurabook.app`,
      `DTSTAMP:${calendarStamp(new Date().toISOString())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${booking.serviceName} - ${booking.businessName}`,
      `DESCRIPTION:Atención con ${booking.staffName}. Teléfono: ${booking.businessPhone}`,
      `LOCATION:${booking.businessAddress}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reserva-${booking.businessSlug}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Enlace directo a WhatsApp del local
  const whatsappUrl = useMemo(() => {
    const raw = booking.businessPhone.replace(/\D/g, "");
    if (!raw) return null;
    const text = encodeURIComponent(
      `Hola ${booking.businessName}, tengo una reserva para ${booking.serviceName} el ${booking.localDate} a las ${booking.localTime} h (Código: ${booking.bookingId.slice(0, 8).toUpperCase()}).`,
    );
    return `https://wa.me/${raw}?text=${text}`;
  }, [booking]);

  const mapsUrl = useMemo(() => {
    if (!booking.businessAddress) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${booking.businessName}, ${booking.businessAddress}`,
    )}`;
  }, [booking]);

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const response = await fetch(`/api/bookings/${token}/cancel`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No fue posible cancelar la reserva.");
      }
      setBooking((prev) => ({ ...prev, status: "cancelled", canCancel: false }));
      setShowConfirm(false);
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : "Error al cancelar.");
    } finally {
      setCancelling(false);
    }
  }

  const isConfirmed = booking.status === "confirmed";
  const isCancelled = booking.status === "cancelled";
  const isCompleted = booking.status === "completed";
  const statusInfo = isConfirmed
    ? { tone: "ok", title: "Tu reserva está confirmada", text: `Te esperamos en ${booking.businessName}.` }
    : isCancelled
      ? { tone: "bad", title: "Reserva cancelada", text: "El horario quedó libre. Puedes volver a agendar cuando quieras." }
      : isCompleted
        ? { tone: "done", title: "Visita completada", text: `Gracias por atenderte en ${booking.businessName}.` }
        : { tone: "done", title: "Reserva no disponible", text: "Esta reserva ya no está activa." };

  return (
    <div className="bk-shell" style={brandVars}>
      <main className="mb-main">
        <Link href={`/reservar/${booking.businessSlug}`} className="mb-business">
          <BusinessLogo name={booking.businessName} url={null} brandColor={booking.brandColor} size={44} />
          <span>
            <b>{booking.businessName}</b>
            {booking.businessAddress && <small>{booking.businessAddress}</small>}
          </span>
        </Link>

        <section className="bk-card mb-card">
          <div className="mb-status">
            <span className={`mb-status-icon ${statusInfo.tone}`}>
              {isCancelled ? <XCircle size={28} /> : <CheckCircle2 size={28} />}
            </span>
            <h1>{statusInfo.title}</h1>
            <p>{statusInfo.text}</p>
          </div>

          <dl className="bk-ticket">
            <div><dt>Servicio</dt><dd>{booking.serviceName}</dd></div>
            <div><dt>Profesional</dt><dd>{booking.staffName}</dd></div>
            <div><dt>Fecha</dt><dd>{formatDate(booking.localDate)}</dd></div>
            <div><dt>Hora</dt><dd>{booking.localTime} h · {booking.durationMin} min</dd></div>
            <div><dt>Total en el local</dt><dd>{formatPrice(booking.priceClp)}</dd></div>
            <div><dt>A nombre de</dt><dd>{booking.clientName}</dd></div>
          </dl>

          {isConfirmed && (
            <div className="mb-actions">
              <a href={googleCalUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                <Calendar size={16} /> Google Calendar
              </a>
              <button type="button" onClick={downloadIcs} className="btn-secondary">
                <CalendarDays size={16} /> Apple / Outlook
              </button>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                  <MapPin size={16} /> Cómo llegar
                </a>
              )}
              {whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                  <MessageCircle size={16} /> Escribir al local
                </a>
              )}
            </div>
          )}

          {isConfirmed && (booking.canCancel ? (
            <div className="mb-cancel">
              {!showConfirm ? (
                <button type="button" onClick={() => setShowConfirm(true)} className="dash-danger-link">
                  Cancelar mi reserva
                </button>
              ) : (
                <div className="mb-confirm" role="alertdialog" aria-labelledby="mb-confirm-title">
                  <p id="mb-confirm-title"><b>¿Cancelar esta hora?</b> Quedará disponible para otra persona.</p>
                  {cancelError && <p className="mb-error">{cancelError}</p>}
                  <div>
                    <button type="button" onClick={handleCancel} disabled={cancelling} className="btn-danger">
                      {cancelling ? "Cancelando…" : "Sí, cancelar"}
                    </button>
                    <button type="button" onClick={() => setShowConfirm(false)} className="btn-secondary">No, mantener</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mb-note">El plazo para cancelar online venció. Si necesitas cambiar tu hora, comunícate con el local.</p>
          ))}

          {isCancelled && (
            <Link href={`/reservar/${booking.businessSlug}`} className="btn-primary mb-again">Agendar una nueva hora</Link>
          )}
        </section>

        <p className="mb-note">Guarda este enlace: es la forma de ver o cancelar tu hora. Código {booking.bookingId.slice(0, 8).toUpperCase()}.</p>
      </main>

      <footer className="bk-footer">
        Reservas con <Link href="/" className="bk-footer-brand"><AuraMark size={16} /><span>AURA<b>BOOK</b></span></Link>
        <span className="bk-footer-links">
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
        </span>
      </footer>
    </div>
  );
}
