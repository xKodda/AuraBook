"use client";

// Estadísticas del negocio (Premium): asistencia, clientes, horarios más pedidos, ocupación por profesional,
// servicios y ausencias. Los montos son estimados a precio de lista: AuraBook no registra pagos de los clientes.

import { useEffect, useMemo, useState } from "react";
import { addCalendarDays, formatDateRange, formatPrice, monthRange, shiftMonth } from "@/lib/dates";
import type { Insights } from "@/lib/insights";

type Preset = "month" | "prev" | "30" | "90";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "month", label: "Este mes" }, { key: "prev", label: "Mes anterior" },
  { key: "30", label: "30 días" }, { key: "90", label: "90 días" },
];
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DOW_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
// Estados de una cita: colores de estado reservados (los mismos de la agenda), siempre con etiqueta y valor.
const STATUS = [
  { key: "completed", label: "Completadas", color: "#216a3c" },
  { key: "confirmed", label: "Por atender", color: "#4F6FA8" },
  { key: "noShow", label: "No asistió", color: "#b07a1f" },
  { key: "cancelled", label: "Canceladas", color: "#b3392a" },
] as const;

function rangeFor(preset: Preset, today: string): { from: string; to: string } {
  if (preset === "month") return monthRange(today);
  if (preset === "prev") return monthRange(shiftMonth(today, -1));
  const days = preset === "30" ? 30 : 90;
  return { from: addCalendarDays(today, -(days - 1)), to: today };
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export function InsightsView({ businessId, today, initial }: { businessId: string; today: string; initial: Insights }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [data, setData] = useState<Insights>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = rangeFor(preset, today);

  useEffect(() => {
    if (preset === "month") { setData(initial); setError(null); return; }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/panel/insights?${new URLSearchParams({ businessId, from: range.from, to: range.to })}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "No se pudieron cargar las estadísticas.");
        setData(body as Insights);
      })
      .catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [preset, businessId, range.from, range.to, initial]);

  const t = data.totals;
  const attended = t.completed + t.noShow;
  const heat = useMemo(() => {
    const hours = data.byHour.map((h) => h.hour);
    const lo = Math.min(9, ...hours), hi = Math.max(20, ...hours);
    const max = Math.max(1, ...data.byHour.map((h) => h.n));
    const cell = new Map(data.byHour.map((h) => [`${h.dow}-${h.hour}`, h.n]));
    const top = [...data.byHour].sort((a, b) => b.n - a.n).slice(0, 3);
    return { hours: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), max, cell, top };
  }, [data.byHour]);
  const maxService = Math.max(1, ...data.byService.map((s) => s.bookings));

  return (
    <div className={`ins${loading ? " loading" : ""}`}>
      <div className="ins-toolbar">
        <div className="rev-seg" role="tablist" aria-label="Periodo">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" role="tab" aria-selected={preset === p.key} className={preset === p.key ? "active" : undefined}
              onClick={() => setPreset(p.key)}>{p.label}</button>
          ))}
        </div>
        <span className="ins-range">{formatDateRange(range.from, range.to)}</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      {t.bookings === 0 ? (
        <p className="dash-card dash-empty">Aún no hay reservas en este periodo.</p>
      ) : (
        <>
          <section className="ins-tiles" aria-label="Resumen">
            <div className="ins-tile"><span>Citas atendidas</span><strong>{t.completed}</strong><small>de {t.bookings} reservas</small></div>
            <div className="ins-tile">
              <span>Asistencia</span><strong>{attended ? `${pct(t.completed, attended)}%` : "—"}</strong>
              <small>{t.noShow} {t.noShow === 1 ? "ausencia" : "ausencias"}</small>
            </div>
            <div className="ins-tile">
              <span>Clientes</span><strong>{data.clients.unique}</strong>
              <small>{data.clients.returning} recurrentes · {data.clients.new} nuevos</small>
            </div>
            <div className="ins-tile">
              <span>Valor estimado</span><strong>{formatPrice(t.estimatedClp)}</strong>
              <small>{formatPrice(t.completedClp)} ya atendido</small>
            </div>
          </section>

          <section className="dash-card ins-card" aria-labelledby="ins-status">
            <h2 id="ins-status">Cómo terminaron las reservas</h2>
            <div className="ins-stack" role="img" aria-label={STATUS.map((s) => `${s.label}: ${t[s.key]}`).join(", ")}>
              {STATUS.map((s) => t[s.key] > 0 && (
                <span key={s.key} style={{ flexGrow: t[s.key], background: s.color }} title={`${s.label}: ${t[s.key]} (${pct(t[s.key], t.bookings)}%)`} />
              ))}
            </div>
            <ul className="ins-legend">
              {STATUS.map((s) => (
                <li key={s.key}><i style={{ background: s.color }} />{s.label} <b>{t[s.key]}</b> <small>{pct(t[s.key], t.bookings)}%</small></li>
              ))}
            </ul>
            {t.lostClp > 0 && (
              <p className="ins-note">Las ausencias equivalen a {formatPrice(t.lostClp)} en horas que no se atendieron (estimado).</p>
            )}
          </section>

          <div className="ins-grid">
            <section className="dash-card ins-card" aria-labelledby="ins-hours">
              <h2 id="ins-hours">Horarios más pedidos</h2>
              {heat.top.length > 0 && (
                <p className="ins-note">
                  Más demanda: {heat.top.map((h) => `${DOW_LONG[h.dow - 1]} a las ${String(h.hour).padStart(2, "0")}:00`).join(", ")}.
                </p>
              )}
              <div className="ins-heat-scroll">
                <table className="ins-heat">
                  <thead>
                    <tr><th />{heat.hours.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {DOW.map((d, i) => (
                      <tr key={d}>
                        <th scope="row">{d}</th>
                        {heat.hours.map((h) => {
                          const n = heat.cell.get(`${i + 1}-${h}`) ?? 0;
                          // Un solo tono (marca): más oscuro = más reservas.
                          const level = n === 0 ? 0 : 15 + Math.round((n / heat.max) * 85);
                          return (
                            <td key={h} title={`${DOW_LONG[i]} ${String(h).padStart(2, "0")}:00 · ${n} ${n === 1 ? "reserva" : "reservas"}`}
                              style={{ background: level ? `color-mix(in srgb, var(--brand) ${level}%, #fff)` : undefined }}>
                              <span className="sr-only">{n}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dash-card ins-card" aria-labelledby="ins-staff">
              <h2 id="ins-staff">Ocupación por profesional</h2>
              <p className="ins-note">Tiempo reservado sobre su horario de atención del periodo.</p>
              <ul className="ins-bars">
                {data.byStaff.map((s) => {
                  const occ = pct(s.bookedMinutes, s.availableMinutes);
                  return (
                    <li key={s.staffId} title={`${s.name}: ${occ}% · ${s.bookings} reservas · ${s.noShow} ausencias · ${formatPrice(s.estimatedClp)} estimado`}>
                      <span className="ins-bar-label">{s.name}</span>
                      <span className="ins-bar-track"><span style={{ width: `${Math.min(occ, 100)}%` }} /></span>
                      <span className="ins-bar-value">{occ}% <small>· {s.bookings} citas{s.noShow ? ` · ${s.noShow} ausencias` : ""}</small></span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="dash-card ins-card" aria-labelledby="ins-services">
              <h2 id="ins-services">Servicios más reservados</h2>
              <ul className="ins-bars">
                {data.byService.map((s) => (
                  <li key={s.name} title={`${s.name}: ${s.bookings} reservas · ${formatPrice(s.estimatedClp)} estimado`}>
                    <span className="ins-bar-label">{s.name}</span>
                    <span className="ins-bar-track"><span style={{ width: `${(s.bookings / maxService) * 100}%` }} /></span>
                    <span className="ins-bar-value">{s.bookings} <small>· {formatPrice(s.estimatedClp)}</small></span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="dash-card ins-card" aria-labelledby="ins-noshows">
              <h2 id="ins-noshows">Clientes con más ausencias</h2>
              {data.topNoShows.length === 0 ? (
                <p className="ins-note">Nadie faltó en este periodo.</p>
              ) : (
                <ul className="ins-list">
                  {data.topNoShows.map((c) => (
                    <li key={c.phone}><span>{c.name}<small>{c.phone}</small></span><b>{c.noShows}</b></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <p className="ins-footnote">Los montos son estimados según el precio de cada servicio al reservar; no corresponden a pagos recibidos.</p>
        </>
      )}
    </div>
  );
}
