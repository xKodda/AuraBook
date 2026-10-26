"use client";

// Ingresos del negocio: semana y mes en curso a la vista, y detalle por semana, mes o rango de fechas.
// Suma las reservas confirmadas y completadas (las canceladas y las inasistencias no cuentan).

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addCalendarDays, daysInRange, formatDateRange, formatMonth, formatPrice, isIsoDate, monthRange, shiftMonth, weekRange,
} from "@/lib/dates";
import type { PanelBusiness, RevenueDay } from "@/lib/types";

type Mode = "week" | "month" | "custom";
type Range = { from: string; to: string };

const MAX_DAYS = 366;

async function fetchRevenue(businessId: string, { from, to }: Range, signal?: AbortSignal): Promise<RevenueDay[]> {
  const query = new URLSearchParams({ businessId, from, to });
  const res = await fetch(`/api/panel/revenue?${query}`, { cache: "no-store", signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudieron cargar los ingresos.");
  return data.days as RevenueDay[];
}

const sum = (days: RevenueDay[], { from, to }: Range) =>
  days.filter((d) => d.day >= from && d.day <= to)
    .reduce((acc, d) => ({ totalClp: acc.totalClp + d.totalClp, bookings: acc.bookings + d.bookings }), { totalClp: 0, bookings: 0 });

export function PanelRevenue({ business, today }: { business: PanelBusiness; today: string }) {
  const currentWeek = useMemo(() => weekRange(today), [today]);
  const currentMonth = useMemo(() => monthRange(today), [today]);

  // Resumen fijo: semana y mes en curso (una sola consulta que cubre ambos).
  const [summary, setSummary] = useState<RevenueDay[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const from = currentWeek.from < currentMonth.from ? currentWeek.from : currentMonth.from;
    const to = currentWeek.to > currentMonth.to ? currentWeek.to : currentMonth.to;
    fetchRevenue(business.id, { from, to }, controller.signal).then(setSummary).catch(() => {});
    return () => controller.abort();
  }, [business.id, currentWeek, currentMonth]);

  // Detalle: por defecto el mes en curso, del día 1 al último día del mes.
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState<Range>(currentMonth);
  const customValid = isIsoDate(custom.from) && isIsoDate(custom.to) && custom.from <= custom.to
    && daysInRange(custom.from, custom.to) <= MAX_DAYS;
  const range: Range = mode === "week" ? weekRange(anchor) : mode === "month" ? monthRange(anchor) : custom;

  const [detail, setDetail] = useState<RevenueDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (mode === "custom" && !customValid) return;
    const controller = new AbortController();
    setError(null);
    fetchRevenue(business.id, range, controller.signal)
      .then(setDetail)
      .catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
    // `range` se recalcula en cada render; basta con sus extremos.
  }, [business.id, range.from, range.to, mode, customValid]);

  function choose(next: Mode) {
    setMode(next);
    setAnchor(today);
  }

  function step(delta: number) {
    setAnchor((a) => (mode === "week" ? addCalendarDays(a, 7 * delta) : shiftMonth(a, delta)));
  }

  const week = summary ? sum(summary, currentWeek) : null;
  const month = summary ? sum(summary, currentMonth) : null;
  const totals = detail ? sum(detail, range) : null;
  const isCurrent = mode !== "custom" && range.from === (mode === "week" ? currentWeek : currentMonth).from;
  const label = mode === "month" ? formatMonth(range.from) : formatDateRange(range.from, range.to);
  const who = business.role === "staff" ? "Tus ingresos" : "Ingresos";

  // Barras por día (hasta dos meses; en rangos más largos basta con el total).
  const bars = useMemo(() => {
    if (!detail || (mode === "custom" && !customValid)) return null;
    const n = daysInRange(range.from, range.to);
    if (n > 62) return null;
    const byDay = new Map(detail.map((d) => [d.day, d]));
    const list = Array.from({ length: n }, (_, i) => {
      const day = addCalendarDays(range.from, i);
      return { day, totalClp: byDay.get(day)?.totalClp ?? 0, bookings: byDay.get(day)?.bookings ?? 0 };
    });
    const max = Math.max(1, ...list.map((d) => d.totalClp));
    return { list, max };
  }, [detail, range.from, range.to, mode, customValid]);

  return (
    <section className="rev" aria-labelledby="rev-title">
      <div className="rev-head">
        <h2 id="rev-title">{who}</h2>
        <p>Reservas confirmadas y completadas</p>
      </div>

      <div className="rev-tiles">
        <button type="button" className={`rev-tile${mode === "week" && isCurrent ? " active" : ""}`} onClick={() => choose("week")}>
          <span>Esta semana</span>
          <strong>{week ? formatPrice(week.totalClp) : "—"}</strong>
          <small>{formatDateRange(currentWeek.from, currentWeek.to)}{week ? ` · ${week.bookings} reservas` : ""}</small>
        </button>
        <button type="button" className={`rev-tile${mode === "month" && isCurrent ? " active" : ""}`} onClick={() => choose("month")}>
          <span>Este mes</span>
          <strong>{month ? formatPrice(month.totalClp) : "—"}</strong>
          <small>{formatDateRange(currentMonth.from, currentMonth.to)}{month ? ` · ${month.bookings} reservas` : ""}</small>
        </button>
      </div>

      <div className="rev-detail">
        <div className="rev-controls">
          <div className="rev-seg" role="tablist" aria-label="Periodo">
            {(["week", "month", "custom"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "active" : undefined}
                onClick={() => choose(m)}>
                {m === "week" ? "Semana" : m === "month" ? "Mes" : "Fechas"}
              </button>
            ))}
          </div>
          {mode === "custom" ? (
            <div className="rev-dates">
              <label>
                <span>Desde</span>
                <input type="date" className="text-input" value={custom.from} max={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              </label>
              <label>
                <span>Hasta</span>
                <input type="date" className="text-input" value={custom.to} min={custom.from}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </label>
            </div>
          ) : (
            <div className="rev-nav">
              <button type="button" onClick={() => step(-1)} aria-label={mode === "week" ? "Semana anterior" : "Mes anterior"}>
                <ChevronLeft size={18} />
              </button>
              <span>{label}</span>
              <button type="button" onClick={() => step(1)} aria-label={mode === "week" ? "Semana siguiente" : "Mes siguiente"}>
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>

        {mode === "custom" && !customValid ? (
          <p className="rev-hint">Elige una fecha de inicio anterior a la de término, con un máximo de un año.</p>
        ) : error ? (
          <p className="form-error" role="alert">{error}</p>
        ) : (
          <>
            <div className="rev-total" aria-live="polite">
              <strong>{totals ? formatPrice(totals.totalClp) : "—"}</strong>
              <span>
                {mode === "custom" ? `${formatDateRange(range.from, range.to)} · ` : ""}
                {totals ? `${totals.bookings} ${totals.bookings === 1 ? "reserva" : "reservas"}` : "Cargando…"}
                {totals && totals.bookings > 0 ? ` · promedio ${formatPrice(Math.round(totals.totalClp / totals.bookings))}` : ""}
              </span>
            </div>
            {bars && (
              <ol className={`rev-bars${bars.list.length <= 7 ? " week" : ""}`} aria-label="Ingresos por día">
                {bars.list.map((d, i, all) => (
                  // En celular solo se rotulan algunos días (cada 5 y el último) para que no se encimen.
                  <li key={d.day} title={`${formatDateRange(d.day, d.day)}: ${formatPrice(d.totalClp)} (${d.bookings})`}
                    className={[d.day > today && "future", (i === 0 || i === all.length - 1 || (i % 5 === 4 && all.length - 1 - i >= 3)) && "lbl"]
                      .filter(Boolean).join(" ") || undefined}>
                    <span className="rev-bar" style={{ height: `${Math.max(d.totalClp ? 6 : 2, (d.totalClp / bars.max) * 100)}%` }} />
                    <small>{bars.list.length <= 7
                      ? new Intl.DateTimeFormat("es-CL", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d.day}T12:00:00Z`)).replace(".", "")
                      : Number(d.day.slice(8))}</small>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </section>
  );
}
