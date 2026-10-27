"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, CalendarOff, Check, ChevronLeft, ChevronRight, ExternalLink, MessageSquare, Plus, RefreshCw, UserX, XCircle,
} from "lucide-react";
import { PanelNewBooking } from "@/components/panel-new-booking";
import { addCalendarDays, dateInTimeZone, formatDate, formatPrice } from "@/lib/dates";
import type { BookingStatus, PanelBooking, PanelBusiness, PanelCatalog, TimeOffBlock } from "@/lib/types";

type Props = {
  business: PanelBusiness;
  initialStaff: { id: string; name: string }[];
  initialBookings: PanelBooking[];
  initialDate: string;
  catalog: PanelCatalog;
  initialTimeOff: TimeOffBlock[];
};

/** Agenda del día. La estructura (menú, selector de negocio, avisos) la pone el layout del panel. */
export function PanelExperience({ business: currentBusiness, initialStaff, initialBookings, initialDate, catalog, initialTimeOff }: Props) {
  const [date, setDate] = useState(initialDate);
  const [staffList, setStaffList] = useState(initialStaff);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bookings, setBookings] = useState<PanelBooking[]>(initialBookings);
  const [timeOff, setTimeOff] = useState<TimeOffBlock[]>(initialTimeOff);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Se incrementa para volver a cargar la agenda (por ejemplo, después de agendar desde el panel).
  const [reloadKey, setReloadKey] = useState(0);
  const firstLoad = useRef(true);

  // Carga de reservas cuando cambia fecha o negocio
  useEffect(() => {
    if (!currentBusiness) return;
    // La primera carga ya viene del servidor.
    if (firstLoad.current) { firstLoad.current = false; return; }
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
        return data as { bookings: PanelBooking[]; staff: { id: string; name: string }[]; timeOff?: TimeOffBlock[] };
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setBookings(data.bookings);
          setTimeOff(data.timeOff ?? []);
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
  }, [currentBusiness, date, reloadKey]);

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

  return (
    <div className="panel-agenda">
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
            <button type="button" className="btn-primary panel-new-btn" onClick={() => setCreating(true)}>
              <Plus size={16} /> Nueva reserva
            </button>
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

        {/* Bloqueos del día (vacaciones, feriados, imprevistos) */}
        {timeOff.length > 0 && (
          <div className="panel-timeoff" role="note">
            <CalendarOff size={16} />
            <div>
              {timeOff.map((t) => {
                const allStaff = t.staffIds.length === staffList.length && staffList.length > 1;
                const hours = t.allDay || (t.fromDate < date && t.toDate > date) ? "todo el día"
                  : `${t.fromDate < date ? "00:00" : t.fromTime} a ${t.toDate > date ? "24:00" : t.toTime}`;
                return (
                  <p key={t.ids.join()}>
                    <b>{allStaff ? "Todo el equipo" : t.staffNames.join(", ")}</b> · bloqueado {hours}{t.reason ? ` · ${t.reason}` : ""}
                  </p>
                );
              })}
            </div>
            {currentBusiness.role !== "staff" && <Link href="/dashboard/bloqueos">Ver bloqueos</Link>}
          </div>
        )}

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
                    {b.overbook && <span className="panel-booking-status-tag status-overbook" title="Agregada a pesar de chocar con otra reserva o el horario">Sobrecupo</span>}
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

        {creating && (
          <PanelNewBooking
            business={currentBusiness}
            catalog={catalog}
            initialDate={date}
            onClose={() => setCreating(false)}
            onCreated={(bookedDate) => {
              setCreating(false);
              setDate(bookedDate);
              setReloadKey((k) => k + 1);
            }}
          />
        )}
    </div>
  );
}
