"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3,
  ExternalLink, MapPin, Phone, Scissors, ShieldCheck, Sparkles, Sun, Sunset, Moon,
  UserRound, Users, WifiOff,
} from "lucide-react";
import {
  addCalendarDays, dateInTimeZone, dayChipParts, formatDate, formatPrice,
  suggestedBookingDate,
} from "@/lib/dates";
import { CATEGORY_COPY, brandStyle } from "@/lib/theme";
import type { AvailableSlot, BookingSuccess, Business, StaffMember } from "@/lib/types";

type Props = { business: Business; demo: boolean };
type AvailabilityState = "idle" | "loading" | "success" | "error";

function getMessage(response: unknown, fallback: string): string {
  if (response && typeof response === "object" && "error" in response && typeof response.error === "string") {
    return response.error;
  }
  return fallback;
}

function CircleNumber({ children }: { children: React.ReactNode }) {
  return <span className="step-number">{children}</span>;
}

export function BookingExperience({ business, demo }: Props) {
  const copy = CATEGORY_COPY[business.category] ?? CATEGORY_COPY.otro;
  const brandVars = useMemo(() => brandStyle(business.brandColor), [business.brandColor]);

  const [serviceId, setServiceId] = useState(business.services[0]?.id ?? "");
  const [staffId, setStaffId] = useState<string>("any");
  const [date, setDate] = useState(() => suggestedBookingDate(business.timezone));
  const [slot, setSlot] = useState<string>("");
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>("idle");
  const [retry, setRetry] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<BookingSuccess | null>(null);

  const today = dateInTimeZone(new Date(), business.timezone);
  const maxDate = addCalendarDays(today, business.maxDaysAhead);
  const service = business.services.find((item) => item.id === serviceId);

  // Profesionales elegibles para el servicio seleccionado
  const eligibleStaff: StaffMember[] = useMemo(
    () => business.staff.filter((m) => m.serviceIds.includes(serviceId)),
    [business.staff, serviceId],
  );

  const chosenStaff = business.staff.find((m) => m.id === staffId);

  // Días iniciales para los chips horizontales (próximos 12 días)
  const dayChips = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < Math.min(12, business.maxDaysAhead); i++) {
      list.push(addCalendarDays(today, i));
    }
    return list;
  }, [today, business.maxDaysAhead]);

  // Horarios únicos ordenados
  const uniqueSlots = useMemo(
    () => [...new Set(slots.map((item) => item.time))].sort(),
    [slots],
  );

  // Horarios agrupados: mañana (< 13:00), tarde (13:00-18:00), noche (>= 18:00)
  const slotGroups = useMemo(() => {
    const morning = uniqueSlots.filter((t) => t < "13:00");
    const afternoon = uniqueSlots.filter((t) => t >= "13:00" && t < "18:00");
    const evening = uniqueSlots.filter((t) => t >= "18:00");
    return { morning, afternoon, evening };
  }, [uniqueSlots]);

  useEffect(() => {
    if (!serviceId || !date) return;
    const controller = new AbortController();
    setSlots([]);
    setSlot("");
    setAvailabilityState("loading");
    const query = new URLSearchParams({
      slug: business.slug,
      serviceId,
      date,
      staffId,
    });
    fetch(`/api/availability?${query.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(getMessage(body, "No pudimos consultar la agenda."));
        if (!body || typeof body !== "object" || !("slots" in body) || !Array.isArray(body.slots)) {
          throw new Error("Respuesta inesperada del servidor.");
        }
        return body.slots as AvailableSlot[];
      })
      .then((available) => {
        if (!controller.signal.aborted) {
          setSlots(available);
          setAvailabilityState("success");
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Availability:", error);
          setAvailabilityState("error");
        }
      });
    return () => controller.abort();
  }, [business.slug, staffId, date, retry, serviceId]);

  function changeService(id: string) {
    setServiceId(id);
    const nextStaff = business.staff.filter((m) => m.serviceIds.includes(id));
    if (staffId !== "any" && !nextStaff.some((m) => m.id === staffId)) setStaffId("any");
    setFormError(null);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service || !slot || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: business.slug,
          serviceId,
          staffId: staffId === "any" ? null : staffId,
          date,
          time: slot,
          name: customerName.trim(),
          phone: customerPhone.trim(),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setSlot("");
          setRetry((n) => n + 1);
        }
        throw new Error(getMessage(body, "No pudimos registrar la reserva."));
      }
      setConfirmed(body as BookingSuccess);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Ocurrió un error inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setConfirmed(null);
    setCustomerName("");
    setCustomerPhone("");
    setSlot("");
    setFormError(null);
    setRetry((n) => n + 1);
  }

  return (
    <div className="page-shell" style={brandVars}>
      {demo && (
        <div className="demo-ribbon" role="status">
          <span className="demo-dot" />
          <span>MODO DEMO · Reservas simuladas para demostración del flujo</span>
          <Link href="/panel" style={{ textDecoration: "underline", marginLeft: 8, fontWeight: 700 }}>
            Ir al panel de gestión →
          </Link>
        </div>
      )}

      <header className="site-header">
        <Link href={`/reservar/${business.slug}`} className="site-brand" aria-label="Inicio">
          <span className="brand-symbol">
            {business.category === "barberia" || business.category === "peluqueria" ? (
              <Scissors size={18} strokeWidth={2.3} />
            ) : (
              <Sparkles size={18} strokeWidth={2.3} />
            )}
          </span>
          <span>
            AURA<span className="brand-accent">BOOK</span>
            <span className="brand-divider">/</span>
            {business.name.toUpperCase()}
          </span>
        </Link>
        <div className="header-links">
          <span className="header-note">
            <ShieldCheck size={16} /> Reserva segura
          </span>
          <Link href="/panel" className="header-action-btn">
            Panel del local
          </Link>
        </div>
      </header>

      <main className="main-layout">
        {/* Panel lateral con identidad del negocio */}
        <aside className="business-panel">
          <div className="business-content">
            <div className="eyebrow">
              <span className="eyebrow-line" /> TU PRÓXIMA VISITA
            </div>
            <div className="business-monogram" aria-hidden="true">
              {business.category === "barberia" || business.category === "peluqueria" ? (
                <Scissors size={40} strokeWidth={1.5} />
              ) : (
                <Sparkles size={40} strokeWidth={1.5} />
              )}
            </div>
            <p className="business-kicker">{copy.kicker}</p>
            <h1>{business.name}</h1>
            <p className="business-tagline">{business.tagline}</p>
            <div className="business-details">
              <div>
                <MapPin size={18} />
                <span>{business.address || "Atención en local"}</span>
              </div>
              {business.phone && (
                <div>
                  <Phone size={18} />
                  <span>{business.phone}</span>
                </div>
              )}
              <div>
                <CalendarDays size={18} />
                <span>Agenda abierta hasta {business.maxDaysAhead} días</span>
              </div>
            </div>
          </div>
          <div className="business-footer">
            <span>{copy.footer}</span>
            <span>AURABOOK</span>
          </div>
        </aside>

        {/* Columna interactiva */}
        <section className="booking-column">
          {confirmed ? (
            <div className="confirmation-view" aria-live="polite">
              <span className="success-icon">
                <CheckCircle2 size={34} />
              </span>
              <div className="label-overline">RESERVA {demo ? "SIMULADA" : "CONFIRMADA"}</div>
              <h2>{demo ? "¡Prueba completada!" : "¡Tu hora está reservada!"}</h2>
              <p>
                {demo
                  ? "El flujo de reserva funcionó con éxito en modo demo. Puedes gestionar la reserva con el enlace generado."
                  : "Tu reserva quedó registrada en el local. Guarda este ticket o abre el enlace privado para gestionar tu visita."}
              </p>

              <div className="ticket">
                <div className="ticket-header">
                  <h4>{business.name}</h4>
                  <span>CÓDIGO: {confirmed.bookingId.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="ticket-body">
                  <div className="ticket-row">
                    <span>Servicio</span>
                    <strong>{service?.name}</strong>
                  </div>
                  <div className="ticket-row">
                    <span>Profesional</span>
                    <strong>{confirmed.assignedStaffName}</strong>
                  </div>
                  <div className="ticket-row">
                    <span>Fecha</span>
                    <strong>{formatDate(date)}</strong>
                  </div>
                  <div className="ticket-row">
                    <span>Hora</span>
                    <strong>{confirmed.time} h</strong>
                  </div>
                  <div className="ticket-row">
                    <span>Duración</span>
                    <strong>{service?.durationMin} minutos</strong>
                  </div>
                  <div className="ticket-row">
                    <span>Total a pagar en local</span>
                    <strong>{service && formatPrice(service.priceClp)}</strong>
                  </div>
                </div>
                <div className="ticket-footer">
                  <span>PAGO DIRECTO EN LOCAL</span>
                  <span>SIN COBRO ADELANTADO</span>
                </div>
              </div>

              <div className="ticket-actions-full">
                <Link
                  href={`/reserva/${confirmed.manageToken}`}
                  className="btn-primary"
                >
                  <ExternalLink size={16} /> Ver y gestionar mi reserva
                </Link>
                <button type="button" className="btn-secondary" onClick={reset}>
                  <ArrowLeft size={16} /> Agendar otra hora
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="form-heading">
                <div className="label-overline">RESERVAS ONLINE / {business.name.toUpperCase()}</div>
                <h2>
                  {copy.headline[0]}
                  <br />
                  <em>{copy.headline[1]}</em>
                </h2>
                <p>Elige tu servicio, fecha y hora en menos de un minuto. Sin cuentas ni registro.</p>
              </div>

              <form onSubmit={submitBooking} className="booking-form">
                {/* Paso 1: Servicios */}
                <div className="form-section">
                  <div className="section-title">
                    <CircleNumber>01</CircleNumber>
                    <div>
                      <h3>{copy.serviceQuestion}</h3>
                      <p>Selecciona lo que deseas agendar.</p>
                    </div>
                  </div>
                  <div className="service-list">
                    {business.services.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => changeService(item.id)}
                        className={`service-card ${serviceId === item.id ? "selected" : ""}`}
                        aria-pressed={serviceId === item.id}
                      >
                        <span className={`selection-mark ${serviceId === item.id ? "active" : ""}`}>
                          {serviceId === item.id && <Check size={14} />}
                        </span>
                        <span className="service-body">
                          <strong>{item.name}</strong>
                          {item.description && <span>{item.description}</span>}
                          <small>
                            <Clock3 size={13} /> {item.durationMin} min
                          </small>
                        </span>
                        <span className="service-price">{formatPrice(item.priceClp)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paso 2: Profesional */}
                <div className="form-section">
                  <div className="section-title">
                    <CircleNumber>02</CircleNumber>
                    <div>
                      <h3>{copy.staffQuestion}</h3>
                      <p>¿Prefieres atenderte con alguien en particular?</p>
                    </div>
                  </div>
                  <div className="staff-grid">
                    <button
                      className={`staff-card ${staffId === "any" ? "selected" : ""}`}
                      type="button"
                      onClick={() => {
                        setStaffId("any");
                        setFormError(null);
                      }}
                      aria-pressed={staffId === "any"}
                    >
                      <span className="staff-avatar">
                        <Users size={20} />
                      </span>
                      <strong>Sin preferencia</strong>
                      <small>Primer disponible</small>
                    </button>
                    {eligibleStaff.map((member) => (
                      <button
                        key={member.id}
                        className={`staff-card ${staffId === member.id ? "selected" : ""}`}
                        type="button"
                        onClick={() => {
                          setStaffId(member.id);
                          setFormError(null);
                        }}
                        aria-pressed={staffId === member.id}
                      >
                        <span className="staff-avatar">
                          <UserRound size={20} />
                        </span>
                        <strong>{member.name}</strong>
                        <small>{member.roleTitle || copy.staffSingular}</small>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paso 3: Día y Horario */}
                <div className="form-section">
                  <div className="section-title">
                    <CircleNumber>03</CircleNumber>
                    <div>
                      <h3>Selecciona día y hora</h3>
                      <p>Disponibilidad en tiempo real ({business.timezone}).</p>
                    </div>
                  </div>

                  {/* Selector horizontal de días tipo chips */}
                  <label className="field-label">Elige la fecha</label>
                  <div className="day-chips-container" role="radiogroup" aria-label="Fecha">
                    {dayChips.map((d) => {
                      const { weekday, day, month } = dayChipParts(d);
                      const isSelected = date === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          className={`day-chip ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setDate(d);
                            setFormError(null);
                          }}
                          role="radio"
                          aria-checked={isSelected}
                        >
                          <span className="day-chip-weekday">{weekday}</span>
                          <span className="day-chip-day">{day}</span>
                          <span className="day-chip-month">{month}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Acceso a selector nativo si desea una fecha más lejana */}
                  <div className="date-fallback-wrap">
                    <span>O elige otra fecha:</span>
                    <input
                      className="date-picker-inline"
                      type="date"
                      value={date}
                      min={today}
                      max={maxDate}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setFormError(null);
                      }}
                    />
                  </div>

                  <div className="time-heading">
                    <span>Horarios disponibles ({formatDate(date)})</span>
                    <span>
                      {availabilityState === "success"
                        ? `${uniqueSlots.length} opciones`
                        : ""}
                    </span>
                  </div>

                  {availabilityState === "loading" && (
                    <div className="loading-slots">
                      <span /><span /><span /><span /><span /><span />
                    </div>
                  )}

                  {availabilityState === "error" && (
                    <div className="empty-state">
                      <WifiOff size={22} />
                      <p>No pudimos cargar los horarios disponibles.</p>
                      <button type="button" onClick={() => setRetry((n) => n + 1)}>
                        Volver a intentar
                      </button>
                    </div>
                  )}

                  {availabilityState === "success" && uniqueSlots.length === 0 && (
                    <div className="empty-state">
                      <CalendarDays size={22} />
                      <p>Sin horarios disponibles para este día.</p>
                      <span>Prueba seleccionando otro profesional o una fecha diferente.</span>
                    </div>
                  )}

                  {availabilityState === "success" && uniqueSlots.length > 0 && (
                    <>
                      {slotGroups.morning.length > 0 && (
                        <div className="time-group">
                          <div className="time-group-label">
                            <Sun size={13} /> Mañana
                          </div>
                          <div className="time-grid">
                            {slotGroups.morning.map((time) => (
                              <button
                                key={time}
                                type="button"
                                className={`time-button ${slot === time ? "selected" : ""}`}
                                onClick={() => {
                                  setSlot(time);
                                  setFormError(null);
                                }}
                                aria-pressed={slot === time}
                              >
                                {time}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {slotGroups.afternoon.length > 0 && (
                        <div className="time-group">
                          <div className="time-group-label">
                            <Sunset size={13} /> Tarde
                          </div>
                          <div className="time-grid">
                            {slotGroups.afternoon.map((time) => (
                              <button
                                key={time}
                                type="button"
                                className={`time-button ${slot === time ? "selected" : ""}`}
                                onClick={() => {
                                  setSlot(time);
                                  setFormError(null);
                                }}
                                aria-pressed={slot === time}
                              >
                                {time}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {slotGroups.evening.length > 0 && (
                        <div className="time-group">
                          <div className="time-group-label">
                            <Moon size={13} /> Noche
                          </div>
                          <div className="time-grid">
                            {slotGroups.evening.map((time) => (
                              <button
                                key={time}
                                type="button"
                                className={`time-button ${slot === time ? "selected" : ""}`}
                                onClick={() => {
                                  setSlot(time);
                                  setFormError(null);
                                }}
                                aria-pressed={slot === time}
                              >
                                {time}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Paso 4: Datos del cliente */}
                <div className="form-section">
                  <div className="section-title">
                    <CircleNumber>04</CircleNumber>
                    <div>
                      <h3>Tus datos de contacto</h3>
                      <p>Para confirmar tu hora y enviarte los detalles.</p>
                    </div>
                  </div>
                  <div className="input-grid">
                    <label>
                      <span className="field-label">Nombre y apellido</span>
                      <input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        autoComplete="name"
                        placeholder="Ej. Camila Morales"
                        required
                        minLength={2}
                        maxLength={80}
                      />
                    </label>
                    <label>
                      <span className="field-label">Teléfono WhatsApp</span>
                      <input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        autoComplete="tel"
                        type="tel"
                        placeholder="Ej. +56 9 1234 5678"
                        required
                        minLength={8}
                        maxLength={20}
                      />
                    </label>
                  </div>
                </div>

                {/* Resumen */}
                <div className="summary-box">
                  <div>
                    <span>Tu cita</span>
                    <strong>{service?.name ?? "Selecciona un servicio"}</strong>
                    <small>
                      {chosenStaff?.name ?? "Primer profesional disponible"}
                      {slot ? ` · ${slot} h (${formatDate(date)})` : " · Sin horario seleccionado"}
                    </small>
                  </div>
                  <strong>{service ? formatPrice(service.priceClp) : "—"}</strong>
                </div>

                {formError && (
                  <div role="alert" className="form-error">
                    {formError}
                  </div>
                )}

                <button
                  className="submit-button"
                  type="submit"
                  disabled={!slot || !service || submitting || availabilityState !== "success"}
                >
                  {submitting ? "Confirmando reserva..." : "Confirmar mi hora"} <ArrowRight size={18} />
                </button>

                <p className="privacy-note">
                  <ShieldCheck size={14} /> Sin cobros online. Pagas directamente al terminar tu servicio en el local.
                </p>
              </form>
            </>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} AuraBook · Plataforma de gestión de reservas.</span>
        <span>Agenda rápida para negocios de estética y belleza.</span>
      </footer>
    </div>
  );
}
