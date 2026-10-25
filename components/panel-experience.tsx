"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, CreditCard,
  DollarSign, ExternalLink, Filter, LogOut, MessageSquare, Phone,
  RefreshCw, Scissors, Sparkles, User, UserX, Users, XCircle,
} from "lucide-react";
import { billingAlert } from "@/lib/billing";
import { addCalendarDays, dateInTimeZone, formatDate, formatPrice } from "@/lib/dates";
import { brandStyle } from "@/lib/theme";
import type { BookingStatus, PanelBooking, PanelBusiness } from "@/lib/types";

type Props = {
  initialBusinesses: PanelBusiness[];
  initialStaff: { id: string; name: string }[];
  initialBookings: PanelBooking[];
  initialDate: string;
  userEmail: string | null;
  demo: boolean;
  /** El usuario es dueño de un negocio que aún no termina el onboarding. */
  pendingOnboarding?: boolean;
  /** Muestra el acceso al panel de plataforma (/admin). */
  platformAdmin?: boolean;
};

const ROLE_LABEL: Record<PanelBusiness["role"], string> = {
  owner: "Propietario",
  admin: "Administrador",
  staff: "Profesional",
};

export function PanelExperience({
  initialBusinesses,
  initialStaff,
  initialBookings,
  initialDate,
  userEmail,
  demo,
  pendingOnboarding = false,
  platformAdmin = false,
}: Props) {
  const [businesses] = useState(initialBusinesses);
  const [selectedBusinessId, setSelectedBusinessId] = useState(
    initialBusinesses[0]?.id ?? "",
  );
  const currentBusiness = useMemo(
    () => businesses.find((b) => b.id === selectedBusinessId) ?? businesses[0],
    [businesses, selectedBusinessId],
  );

  const billingNotice = billingAlert(currentBusiness?.billing);

  const brandVars = useMemo(
    () => (currentBusiness ? brandStyle(currentBusiness.brandColor) : {}),
    [currentBusiness],
  );

  const [date, setDate] = useState(initialDate);
  const [staffList, setStaffList] = useState(initialStaff);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bookings, setBookings] = useState<PanelBooking[]>(initialBookings);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Carga de reservas cuando cambia fecha o negocio
  useEffect(() => {
    if (!currentBusiness) return;
    const controller = new AbortController();
    setLoading(true);
    const query = new URLSearchParams({
      businessId: currentBusiness.id,
      date,
    });

    fetch(`/api/panel/bookings?${query.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Error al cargar reservas.");
        const data = await res.json();
        return data as { bookings: PanelBooking[]; staff: { id: string; name: string }[] };
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setBookings(data.bookings);
          if (data.staff) setStaffList(data.staff);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error("Panel bookings fetch:", err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentBusiness, date]);

  // Navegación de fechas
  function changeDate(daysDelta: number) {
    setDate((prev) => addCalendarDays(prev, daysDelta));
  }

  function goToToday() {
    if (!currentBusiness) return;
    setDate(dateInTimeZone(new Date(), currentBusiness.timezone));
  }

  // Actualizar estado de una reserva
  async function updateStatus(bookingId: string, nextStatus: BookingStatus) {
    if (!currentBusiness) return;
    setActionInProgress(bookingId);
    try {
      const res = await fetch(`/api/panel/bookings/${bookingId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: currentBusiness.id,
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "No se pudo actualizar el estado.");
        return;
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: nextStatus } : b)),
      );
    } catch (err) {
      console.error("Update status error:", err);
      alert("Error de conexión al actualizar la reserva.");
    } finally {
      setActionInProgress(null);
    }
  }

  // Filtrado de citas
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (selectedStaffId !== "all" && b.staffId !== selectedStaffId) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      return true;
    });
  }, [bookings, selectedStaffId, statusFilter]);

  // Métricas del día
  const metrics = useMemo(() => {
    const total = bookings.length;
    const confirmed = bookings.filter((b) => b.status === "confirmed").length;
    const completed = bookings.filter((b) => b.status === "completed").length;
    const noShow = bookings.filter((b) => b.status === "no_show").length;
    const cancelled = bookings.filter((b) => b.status === "cancelled").length;
    const revenueExpected = bookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .reduce((sum, b) => sum + b.priceClp, 0);

    return { total, confirmed, completed, noShow, cancelled, revenueExpected };
  }, [bookings]);

  if (!currentBusiness) {
    return (
      <div className="panel-shell">
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2>No tienes acceso a ningún local activo.</h2>
          <p>Contacta al administrador para que agregue tu usuario a una sucursal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-shell" style={brandVars}>
      {demo && (
        <div className="demo-ribbon" role="status">
          <span className="demo-dot" />
          <span>MODO DEMO DEL PANEL · Puedes probar cambios de estado sin base de datos real</span>
        </div>
      )}

      {/* Cabecera del Panel */}
      <header className="panel-header">
        <div className="panel-nav-left">
          <Link href="/dashboard" className="site-brand">
            <span className="brand-symbol">
              {currentBusiness.category === "barberia" || currentBusiness.category === "peluqueria" ? (
                <Scissors size={18} strokeWidth={2.3} />
              ) : (
                <Sparkles size={18} strokeWidth={2.3} />
              )}
            </span>
            <span>
              AURA<span className="brand-accent">BOOK</span>
              <span className="brand-divider">/</span>
              PANEL
            </span>
          </Link>

          {/* Selector de local si tiene más de uno */}
          {businesses.length > 1 ? (
            <div className="panel-business-selector">
              <select
                value={selectedBusinessId}
                onChange={(e) => setSelectedBusinessId(e.target.value)}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({ROLE_LABEL[b.role]})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-secondary)" }}>
              {currentBusiness.name}
            </span>
          )}
        </div>

        <div className="panel-user-menu">
          {platformAdmin && (
            <Link href="/admin" className="header-action-btn">Plataforma</Link>
          )}
          {currentBusiness.role !== "staff" && (
            <Link href={`/dashboard/plan?negocio=${currentBusiness.id}`} className="header-action-btn">
              <CreditCard size={14} /> Mi plan
            </Link>
          )}
          <Link
            href={`/reservar/${currentBusiness.slug}`}
            target="_blank"
            className="header-action-btn"
            title="Abrir página pública"
          >
            <ExternalLink size={14} /> Ver página pública
          </Link>

          {userEmail && (
            <span className="panel-user-email" style={{ fontSize: 12 }}>
              {userEmail}
            </span>
          )}

          {!demo && (
            <form action="/auth/logout" method="POST">
              <button type="submit" className="panel-logout-btn" title="Cerrar sesión">
                <LogOut size={14} />
              </button>
            </form>
          )}
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="panel-main">
        {billingNotice && (
          <div className={`panel-notice${billingNotice.tone === "warning" ? " warning" : ""}`} role="status">
            <span>{billingNotice.message}</span>
            <Link href={`/dashboard/plan?negocio=${currentBusiness.id}`} className="header-action-btn">Ver mi plan</Link>
          </div>
        )}
        {pendingOnboarding && (
          <div className="panel-notice">
            <span>Tienes un negocio con la configuración pendiente.</span>
            <Link href="/onboarding" className="header-action-btn">Continuar configuración</Link>
          </div>
        )}

        {/* Barra de herramientas: Navegación de fecha y filtros */}
        <div className="panel-toolbar">
          <div className="panel-date-nav">
            <button
              type="button"
              onClick={() => changeDate(-1)}
              title="Día anterior"
              aria-label="Día anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="panel-date-label">{formatDate(date)}</span>
            <button
              type="button"
              onClick={() => changeDate(1)}
              title="Día siguiente"
              aria-label="Día siguiente"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={goToToday}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "0 8px",
                width: "auto",
                borderLeft: "1px solid var(--line)",
              }}
            >
              Hoy
            </button>
          </div>

          <div className="panel-filters">
            {/* Filtro por profesional */}
            {staffList.length > 1 && (
              <select
                className="panel-filter-pill"
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
              >
                <option value="all">Todo el equipo ({staffList.length})</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            {/* Filtro por estado */}
            <select
              className="panel-filter-pill"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="confirmed">Confirmadas</option>
              <option value="completed">Completadas</option>
              <option value="no_show">No asistió</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>
        </div>

        {/* Métricas clave del día */}
        <div className="panel-metrics-row">
          <div className="panel-metric-card">
            <span>Total Citas</span>
            <strong>{metrics.total}</strong>
          </div>
          <div className="panel-metric-card">
            <span style={{ color: "#216a3c" }}>Confirmadas</span>
            <strong style={{ color: "#216a3c" }}>{metrics.confirmed}</strong>
          </div>
          <div className="panel-metric-card">
            <span style={{ color: "#354760" }}>Completadas</span>
            <strong>{metrics.completed}</strong>
          </div>
          <div className="panel-metric-card">
            <span style={{ color: "#9c671b" }}>No asistió</span>
            <strong>{metrics.noShow}</strong>
          </div>
          <div className="panel-metric-card">
            <span>Ingreso Estimado</span>
            <strong>{formatPrice(metrics.revenueExpected)}</strong>
          </div>
        </div>

        {/* Listado de citas */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            <p>Cargando agenda...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="empty-state" style={{ padding: 48 }}>
            <CalendarDays size={32} />
            <p>No hay citas programadas para este filtro o fecha.</p>
            <span>Selecciona otro día o invita a tus clientes compartiendo tu enlace público.</span>
            <Link
              href={`/reservar/${currentBusiness.slug}`}
              target="_blank"
              className="btn-primary"
              style={{ marginTop: 12 }}
            >
              <ExternalLink size={14} /> Abrir página de reservas
            </Link>
          </div>
        ) : (
          <div className="panel-bookings-list">
            {filteredBookings.map((b) => {
              const waNumber = b.clientPhone.replace(/\D/g, "");
              const waUrl = waNumber
                ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
                    `Hola ${b.clientName}, te escribimos de ${currentBusiness.name} por tu cita de hoy a las ${b.startTime} h.`,
                  )}`
                : null;

              const isWorking = actionInProgress === b.id;

              return (
                <div key={b.id} className="panel-booking-card">
                  <div className="panel-booking-time">
                    <strong>{b.startTime}</strong>
                    <small>hasta {b.endTime}</small>
                  </div>

                  <div className="panel-booking-info">
                    <div>
                      <strong>{b.clientName}</strong>
                      <span style={{ margin: "0 6px", color: "var(--muted)" }}>·</span>
                      <span>{b.serviceName}</span>
                      <span style={{ margin: "0 6px", color: "var(--muted)" }}>·</span>
                      <strong>{formatPrice(b.priceClp)}</strong>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        Atiende: <strong>{b.staffName}</strong>
                      </span>

                      {waUrl && (
                        <a href={waUrl} target="_blank" rel="noopener noreferrer">
                          <MessageSquare size={13} /> {b.clientPhone}
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className={`panel-booking-status-tag status-${b.status}`}>
                      {b.status === "confirmed" && "Confirmada"}
                      {b.status === "completed" && "Completada"}
                      {b.status === "no_show" && "No asistió"}
                      {b.status === "cancelled" && "Cancelada"}
                    </span>
                  </div>

                  {/* Acciones de gestión de estado */}
                  <div className="panel-booking-actions">
                    {b.status === "confirmed" && (
                      <>
                        <button
                          type="button"
                          className="panel-action-btn btn-complete"
                          disabled={isWorking}
                          onClick={() => updateStatus(b.id, "completed")}
                          title="Marcar como atendida"
                        >
                          <Check size={14} /> Completar
                        </button>
                        <button
                          type="button"
                          className="panel-action-btn"
                          disabled={isWorking}
                          onClick={() => updateStatus(b.id, "no_show")}
                          title="Marcar que el cliente no llegó"
                        >
                          <UserX size={14} /> No asistió
                        </button>
                        <button
                          type="button"
                          className="panel-action-btn"
                          style={{ color: "#b3392a" }}
                          disabled={isWorking}
                          onClick={() => {
                            if (confirm(`¿Cancelar la reserva de ${b.clientName}?`)) {
                              updateStatus(b.id, "cancelled");
                            }
                          }}
                          title="Cancelar cita"
                        >
                          <XCircle size={14} /> Cancelar
                        </button>
                      </>
                    )}

                    {b.status !== "confirmed" && (
                      <button
                        type="button"
                        className="panel-action-btn"
                        disabled={isWorking}
                        onClick={() => updateStatus(b.id, "confirmed")}
                        title="Reactivar reserva"
                      >
                        Reactivar cita
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
