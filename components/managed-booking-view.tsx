"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar, CalendarDays, CheckCircle2, Clock3, ExternalLink, MapPin,
  MessageCircle, Phone, Scissors, ShieldAlert, Sparkles, User, XCircle,
} from "lucide-react";
import { calendarStamp, formatDate, formatPrice } from "@/lib/dates";
import { brandStyle } from "@/lib/theme";
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

  return (
    <div className="page-shell" style={brandVars}>
      <header className="site-header">
        <Link href={`/reservar/${booking.businessSlug}`} className="site-brand">
          <span className="brand-symbol">
            {booking.businessCategory === "barberia" || booking.businessCategory === "peluqueria" ? (
              <Scissors size={18} strokeWidth={2.3} />
            ) : (
              <Sparkles size={18} strokeWidth={2.3} />
            )}
          </span>
          <span>
            AURA<span className="brand-accent">BOOK</span>
            <span className="brand-divider">/</span>
            {booking.businessName.toUpperCase()}
          </span>
        </Link>
        <Link href={`/reservar/${booking.businessSlug}`} className="header-action-btn">
          Nueva reserva
        </Link>
      </header>

      <main style={{ maxWidth: 640, margin: "30px auto", padding: "0 20px 60px", width: "100%" }}>
        {/* Estado principal */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {isConfirmed && (
            <>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  background: "#eaf4ed",
                  color: "#216a3c",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h1 style={{ fontSize: 26, margin: "0 0 6px", fontWeight: 800 }}>Tu reserva está confirmada</h1>
              <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                Te esperamos en {booking.businessName} el día programado.
              </p>
            </>
          )}

          {isCancelled && (
            <>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  background: "#fdf2f0",
                  color: "#b3392a",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <XCircle size={32} />
              </div>
              <h1 style={{ fontSize: 26, margin: "0 0 6px", fontWeight: 800, color: "#b3392a" }}>
                Reserva cancelada
              </h1>
              <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                Este horario fue liberado. Si deseas, puedes volver a agendar en cualquier momento.
              </p>
            </>
          )}

          {isCompleted && (
            <>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  background: "#edf2f7",
                  color: "#354760",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h1 style={{ fontSize: 26, margin: "0 0 6px", fontWeight: 800 }}>Visita completada</h1>
              <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                Gracias por atenderte en {booking.businessName}.
              </p>
            </>
          )}
        </div>

        {/* Tarjeta con los detalles */}
        <div className="ticket">
          <div className="ticket-header">
            <div>
              <h4 style={{ margin: 0 }}>{booking.businessName}</h4>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{booking.businessAddress}</span>
            </div>
            <span
              className={`panel-booking-status-tag status-${booking.status}`}
              style={{ fontWeight: 800 }}
            >
              {booking.status === "confirmed" ? "CONFIRMADA" : booking.status === "cancelled" ? "CANCELADA" : booking.status}
            </span>
          </div>

          <div className="ticket-body">
            <div className="ticket-row">
              <span>Cliente</span>
              <strong>{booking.clientName}</strong>
            </div>
            <div className="ticket-row">
              <span>Servicio</span>
              <strong>{booking.serviceName}</strong>
            </div>
            <div className="ticket-row">
              <span>Profesional</span>
              <strong>{booking.staffName}</strong>
            </div>
            <div className="ticket-row">
              <span>Fecha</span>
              <strong>{formatDate(booking.localDate)}</strong>
            </div>
            <div className="ticket-row">
              <span>Hora</span>
              <strong>{booking.localTime} h</strong>
            </div>
            <div className="ticket-row">
              <span>Duración</span>
              <strong>{booking.durationMin} minutos</strong>
            </div>
            <div className="ticket-row">
              <span>Total a pagar en local</span>
              <strong>{formatPrice(booking.priceClp)}</strong>
            </div>
          </div>

          <div className="ticket-footer">
            <span>CÓDIGO: {booking.bookingId.slice(0, 8).toUpperCase()}</span>
            <span>TOKEN PRIVADO</span>
          </div>
        </div>

        {/* Acciones principales si está confirmada */}
        {isConfirmed && (
          <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <a
                href={googleCalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ fontSize: 13 }}
              >
                <Calendar size={16} /> Google Calendar
              </a>
              <button
                type="button"
                onClick={downloadIcs}
                className="btn-secondary"
                style={{ fontSize: 13 }}
              >
                <CalendarDays size={16} /> Apple / Outlook (.ics)
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ fontSize: 13 }}
                >
                  <MapPin size={16} /> Cómo llegar
                </a>
              )}
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ fontSize: 13 }}
                >
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}
            </div>

            {/* Cancelación */}
            {booking.canCancel ? (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                {!showConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    className="btn-danger"
                    style={{ width: "100%" }}
                  >
                    Cancelar mi reserva
                  </button>
                ) : (
                  <div
                    style={{
                      background: "#fdf2f0",
                      border: "1px solid #f0b9b3",
                      borderRadius: "var(--radius-md)",
                      padding: 16,
                      textAlign: "center",
                    }}
                  >
                    <p style={{ margin: "0 0 12px", color: "#b3392a", fontWeight: 700, fontSize: 14 }}>
                      ¿Seguro que deseas cancelar esta hora?
                    </p>
                    <p style={{ margin: "0 0 16px", color: "#666", fontSize: 12 }}>
                      El horario quedará disponible para que otra persona lo tome.
                    </p>
                    {cancelError && (
                      <p style={{ color: "#b3392a", fontSize: 12, marginBottom: 12 }}>{cancelError}</p>
                    )}
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="btn-danger"
                        style={{ height: 40 }}
                      >
                        {cancelling ? "Cancelando..." : "Sí, cancelar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowConfirm(false)}
                        className="btn-secondary"
                        style={{ height: 40 }}
                      >
                        No cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", margin: "16px 0 0" }}>
                El plazo para cancelar de forma automática ha vencido. Si necesitas modificar tu hora,
                comunícate directamente con el local.
              </p>
            )}
          </div>
        )}

        {isCancelled && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <Link
              href={`/reservar/${booking.businessSlug}`}
              className="btn-primary"
              style={{ display: "inline-flex" }}
            >
              Agendar una nueva hora
            </Link>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} AuraBook · Portal de gestión de reservas.</span>
        <span>Guarda este enlace para consultar tu hora cuando quieras.</span>
      </footer>
    </div>
  );
}
