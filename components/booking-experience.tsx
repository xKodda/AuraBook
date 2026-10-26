"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ExternalLink, MapPin, Phone, ShieldCheck, Users, WifiOff,
} from "lucide-react";
import {
  addCalendarDays, dateInTimeZone, dayChipParts, formatDate, formatPrice,
  suggestedBookingDate,
} from "@/lib/dates";
import { CATEGORY_COPY, brandStyle } from "@/lib/theme";
import { sandboxSlots } from "@/lib/sandbox";
import type { AvailableSlot, BookingSuccess, Business, StaffMember } from "@/lib/types";
import { AuraMark } from "./aura-mark";
import { BusinessLogo } from "./business-logo";
import { Turnstile } from "./turnstile";

// Se incrusta en el build (NEXT_PUBLIC_*). Sin clave, no se muestra el captcha.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * `demo`: el sitio corre en DEMO_MODE (reservas en memoria del servidor).
 * `sandbox`: demo pública /demo; todo ocurre en el navegador y no se envía ni guarda nada.
 */
type Props = { business: Business; demo: boolean; sandbox?: boolean };

/** Plazo de cancelación online, mostrado antes de confirmar (lo exigen los Términos, punto 6). */
function cancelPolicy(min: number): string {
  if (min <= 0) return "Puedes cancelar online hasta la hora de tu cita.";
  const when = min % 1440 === 0 ? `${min / 1440} ${min === 1440 ? "día" : "días"}`
    : min % 60 === 0 ? `${min / 60} ${min === 60 ? "hora" : "horas"}` : `${min} minutos`;
  return `Puedes cancelar online hasta ${when} antes.`;
}
type AvailabilityState = "idle" | "loading" | "success" | "error";

function getMessage(response: unknown, fallback: string): string {
  if (response && typeof response === "object" && "error" in response && typeof response.error === "string") {
    return response.error;
  }
  return fallback;
}

export function BookingExperience({ business, demo, sandbox = false }: Props) {
  const captchaKey = sandbox ? "" : TURNSTILE_SITE_KEY;
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
  const [customerEmail, setCustomerEmail] = useState("");
  const [wantsReminder, setWantsReminder] = useState(true);
  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail.trim());
  // El recordatorio solo se ofrece si el plan del negocio lo incluye (lib/plans.ts).
  const offersReminder = business.features.includes("client_reminders");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<BookingSuccess | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

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
    if (sandbox) {
      const timer = window.setTimeout(() => {
        setSlots(sandboxSlots(serviceId, date, staffId === "any" ? null : staffId));
        setAvailabilityState("success");
      }, 250);
      return () => window.clearTimeout(timer);
    }
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
  }, [business.slug, staffId, date, retry, serviceId, sandbox]);

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
    if (sandbox) {
      // Demo pública: se simula la confirmación sin enviar los datos a ningún lado.
      const assigned = slots.find((s) => s.time === slot && (staffId === "any" || s.staffId === staffId));
      window.setTimeout(() => {
        setConfirmed({
          bookingId: "demo", manageToken: "", time: slot, demo: true,
          assignedStaffId: assigned?.staffId ?? "", assignedStaffName: assigned?.staffName ?? "",
        });
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 500);
      return;
    }
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
          email: customerEmail.trim(),
          reminder: offersReminder && emailLooksValid && wantsReminder,
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        // El token de Turnstile ya se consumió: pedir uno nuevo para el siguiente intento.
        if (captchaKey) setCaptchaReset((n) => n + 1);
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
    setCustomerEmail("");
    setSlot("");
    setFormError(null);
    setRetry((n) => n + 1);
  }

  const slotButtons = (times: string[]) => (
    <div className="bk-times">
      {times.map((time) => (
        <button key={time} type="button" className={`bk-time${slot === time ? " selected" : ""}`}
          aria-pressed={slot === time} onClick={() => { setSlot(time); setFormError(null); }}>
          {time}
        </button>
      ))}
    </div>
  );

  const BusinessCard = (
    <div className="bk-business">
      <BusinessLogo name={business.name} url={business.logoUrl} brandColor={business.brandColor} size={56} />
      <div className="bk-business-text">
        <span className="bk-kicker">{copy.kicker}</span>
        <h1>{business.name}</h1>
        {business.tagline && <p className="bk-tagline">{business.tagline}</p>}
      </div>
      <ul className="bk-business-meta">
        {business.address && <li><MapPin size={14} /> {business.address}</li>}
        {business.phone && <li><Phone size={14} /> {business.phone}</li>}
      </ul>
      {business.description && <p className="bk-description">{business.description}</p>}
    </div>
  );

  return (
    <div className="bk-shell" style={brandVars}>
      {sandbox && (
        <div className="demo-ribbon" role="status">
          <span className="demo-dot" />
          <span>DEMOSTRACIÓN · Negocio ficticio, no se guarda ningún dato</span>
          <Link href="/registro" style={{ textDecoration: "underline", marginLeft: 8, fontWeight: 700 }}>
            Crear la mía →
          </Link>
        </div>
      )}
      {demo && !sandbox && (
        <div className="demo-ribbon" role="status">
          <span className="demo-dot" />
          <span>MODO DEMO · Reservas simuladas</span>
          <Link href="/dashboard" style={{ textDecoration: "underline", marginLeft: 8, fontWeight: 700 }}>
            Ir al panel →
          </Link>
        </div>
      )}

      <main className="bk-layout">
        <aside className="bk-aside">{BusinessCard}</aside>

        <section className="bk-main">
          {confirmed ? (
            <div className="bk-card bk-confirm" aria-live="polite">
              <span className="success-icon"><CheckCircle2 size={30} /></span>
              <h2>{demo ? "¡Prueba completada!" : "¡Tu hora está reservada!"}</h2>
              <p className="bk-muted">
                {sandbox
                  ? "Así de rápido reservan tus clientes. Esta reserva fue simulada: no se guardó ni se envió ningún dato."
                  : "Guarda el enlace de tu reserva: desde ahí puedes verla, agregarla a tu calendario o cancelarla."}
              </p>
              <dl className="bk-ticket">
                <div><dt>Servicio</dt><dd>{service?.name}</dd></div>
                <div><dt>Profesional</dt><dd>{confirmed.assignedStaffName}</dd></div>
                <div><dt>Fecha</dt><dd>{formatDate(date)}</dd></div>
                <div><dt>Hora</dt><dd>{confirmed.time} h · {service?.durationMin} min</dd></div>
                <div><dt>Total en el local</dt><dd>{service && formatPrice(service.priceClp)}</dd></div>
              </dl>
              <div className="bk-confirm-actions">
                {sandbox ? (
                  <Link href="/registro" className="btn-primary">
                    Crear mi página de reservas <ArrowRight size={16} />
                  </Link>
                ) : (
                  <Link href={`/reserva/${confirmed.manageToken}`} className="btn-primary">
                    <ExternalLink size={16} /> Ver mi reserva
                  </Link>
                )}
                <button type="button" className="btn-secondary" onClick={reset}>
                  <ArrowLeft size={16} /> Agendar otra hora
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submitBooking} className="bk-form">
              {/* 1 · Servicio */}
              <div className="bk-card">
                <div className="bk-card-head">
                  <span className="bk-num">1</span>
                  <h2>{copy.serviceQuestion}</h2>
                </div>
                <div className="bk-services" role="radiogroup" aria-label="Servicio">
                  {business.services.map((item) => (
                    <button key={item.id} type="button" role="radio" aria-checked={serviceId === item.id}
                      className={`bk-service${serviceId === item.id ? " selected" : ""}`}
                      onClick={() => changeService(item.id)}>
                      <span className="bk-radio" />
                      <span className="bk-service-body">
                        <strong>{item.name}</strong>
                        <small>{item.durationMin} min{item.description ? ` · ${item.description}` : ""}</small>
                      </span>
                      <span className="bk-price">{formatPrice(item.priceClp)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2 · Profesional */}
              <div className="bk-card">
                <div className="bk-card-head">
                  <span className="bk-num">2</span>
                  <h2>{copy.staffQuestion}</h2>
                </div>
                <div className="bk-pills" role="radiogroup" aria-label="Profesional">
                  <button type="button" role="radio" aria-checked={staffId === "any"}
                    className={`bk-pill${staffId === "any" ? " selected" : ""}`}
                    onClick={() => { setStaffId("any"); setFormError(null); }}>
                    <span className="bk-avatar"><Users size={13} /></span> Cualquiera
                  </button>
                  {eligibleStaff.map((member) => (
                    <button key={member.id} type="button" role="radio" aria-checked={staffId === member.id}
                      className={`bk-pill${staffId === member.id ? " selected" : ""}`}
                      onClick={() => { setStaffId(member.id); setFormError(null); }}>
                      <span className="bk-avatar">{member.name.charAt(0).toUpperCase()}</span>
                      <span className="bk-pill-text">
                        {member.name}
                        {member.roleTitle && <small>{member.roleTitle}</small>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3 · Día y hora */}
              <div className="bk-card">
                <div className="bk-card-head">
                  <span className="bk-num">3</span>
                  <h2>Día y hora</h2>
                  <label className="bk-date-more" title="Elegir otra fecha">
                    <CalendarDays size={15} />
                    <span>Otra fecha</span>
                    <input type="date" value={date} min={today} max={maxDate}
                      onChange={(e) => { if (e.target.value) { setDate(e.target.value); setFormError(null); } }} />
                  </label>
                </div>
                <div className="bk-days" role="radiogroup" aria-label="Fecha">
                  {[...new Set([...dayChips, date])].sort().map((d) => {
                    const { weekday, day, month } = dayChipParts(d);
                    return (
                      <button key={d} type="button" role="radio" aria-checked={date === d}
                        className={`bk-day${date === d ? " selected" : ""}`}
                        onClick={() => { setDate(d); setFormError(null); }}>
                        <span>{d === today ? "hoy" : weekday}</span>
                        <strong>{day}</strong>
                        <span>{month}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="bk-slots" aria-live="polite">
                  {availabilityState === "loading" && (
                    <div className="loading-slots"><span /><span /><span /><span /><span /><span /></div>
                  )}
                  {availabilityState === "error" && (
                    <div className="bk-empty">
                      <WifiOff size={18} />
                      <span>No pudimos cargar los horarios.</span>
                      <button type="button" className="onb-link-btn" onClick={() => setRetry((n) => n + 1)}>Reintentar</button>
                    </div>
                  )}
                  {availabilityState === "success" && uniqueSlots.length === 0 && (
                    <div className="bk-empty">
                      <CalendarDays size={18} />
                      <span>No quedan horas el {formatDate(date).split(",")[0]}.</span>
                      {date < maxDate && (
                        <button type="button" className="onb-link-btn" onClick={() => setDate(addCalendarDays(date, 1))}>
                          Ver el día siguiente
                        </button>
                      )}
                    </div>
                  )}
                  {availabilityState === "success" && uniqueSlots.length > 0 && (
                    <>
                      {slotGroups.morning.length > 0 && <><span className="bk-slot-label">Mañana</span>{slotButtons(slotGroups.morning)}</>}
                      {slotGroups.afternoon.length > 0 && <><span className="bk-slot-label">Tarde</span>{slotButtons(slotGroups.afternoon)}</>}
                      {slotGroups.evening.length > 0 && <><span className="bk-slot-label">Noche</span>{slotButtons(slotGroups.evening)}</>}
                    </>
                  )}
                </div>
              </div>

              {/* 4 · Datos */}
              <div className="bk-card">
                <div className="bk-card-head">
                  <span className="bk-num">4</span>
                  <h2>Tus datos</h2>
                </div>
                <div className="bk-inputs">
                  <label>
                    <span className="field-label">Nombre y apellido</span>
                    <input className="text-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                      autoComplete="name" placeholder="Camila Morales" required minLength={2} maxLength={80} />
                  </label>
                  <label>
                    <span className="field-label">WhatsApp</span>
                    <input className="text-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                      autoComplete="tel" type="tel" inputMode="tel" placeholder="+56 9 1234 5678" required minLength={8} maxLength={20} />
                  </label>
                  <label className="bk-input-wide">
                    <span className="field-label">Correo <em className="onb-optional">opcional</em></span>
                    <input className="text-input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                      autoComplete="email" type="email" inputMode="email" placeholder="Para recibir la confirmación" maxLength={254} />
                  </label>
                </div>
                {offersReminder && <label className={`bk-reminder${emailLooksValid ? "" : " disabled"}`}>
                  <input type="checkbox" checked={emailLooksValid && wantsReminder} disabled={!emailLooksValid}
                    onChange={(e) => setWantsReminder(e.target.checked)} />
                  <span>
                    Recordarme por correo el día antes
                    {!emailLooksValid && <small>Ingresa tu correo para activarlo.</small>}
                  </span>
                </label>}
              </div>

              {/* Resumen y confirmación */}
              <div className="bk-card bk-summary">
                <div className="bk-summary-row">
                  <div className="bk-summary-text">
                    <strong>{service?.name ?? "Elige un servicio"}</strong>
                    <small>
                      {chosenStaff?.name ?? "Cualquier profesional"} · {slot ? `${formatDate(date).split(",")[0]} ${dayChipParts(date).day}, ${slot} h` : "elige una hora"}
                    </small>
                  </div>
                  <strong className="bk-summary-price">{service ? formatPrice(service.priceClp) : "—"}</strong>
                </div>

                {formError && <div role="alert" className="form-error">{formError}</div>}

                {captchaKey && (
                  <Turnstile siteKey={captchaKey} resetKey={captchaReset} onToken={setCaptchaToken} />
                )}

                <button className="submit-button" type="submit"
                  disabled={!slot || !service || submitting || availabilityState !== "success"
                    || (Boolean(captchaKey) && !captchaToken)}>
                  {submitting ? "Confirmando…" : slot ? `Confirmar ${slot} h` : "Confirmar mi hora"} <ArrowRight size={18} />
                </button>
                <p className="bk-policy">
                  <ShieldCheck size={13} />
                  <span>
                    Pagas en el local, sin pagos online. {cancelPolicy(business.cancelNoticeMin)}{" "}
                    Al reservar aceptas la <Link href="/privacidad" target="_blank">Política de Privacidad</Link>.
                  </span>
                </p>
              </div>
            </form>
          )}
        </section>
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
