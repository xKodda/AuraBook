"use client";

// Agenda semanal (lunes a domingo). Escritorio: grilla por hora con una columna por día; las citas que se cruzan
// se ponen lado a lado y cada profesional tiene su color. Celular: lista por día. Al tocar una cita o un día se
// abre ese día en la vista diaria, donde están las acciones (completar, no asistió, cancelar).

import { useEffect, useMemo, useState } from "react";
import { CalendarOff } from "lucide-react";
import { addCalendarDays, dayChipParts, formatPrice, minutes, timeInTimeZone } from "@/lib/dates";
import type { PanelBooking, TimeOffBlock } from "@/lib/types";

const HOUR_PX = 64;
// Colores por profesional (en el orden del equipo). Con contraste suficiente para texto blanco.
const STAFF_COLORS = ["#2F3A56", "#9A6B3F", "#3E7C6B", "#8B4F7A", "#4F6FA8", "#A4552F", "#5E6B2F", "#6B4FA0"];

type Props = {
  weekStart: string;
  today: string;
  timezone: string;
  bookings: PanelBooking[];
  timeOff: TimeOffBlock[];
  staffList: { id: string; name: string }[];
  selectedStaffId: string;
  statusFilter: string;
  loading: boolean;
  onOpenDay: (date: string) => void;
};

type Placed = PanelBooking & { start: number; end: number; lane: number; lanes: number };

/** Reparte las citas que se cruzan en carriles lado a lado (cada grupo de citas solapadas comparte ancho). */
function placeDay(list: PanelBooking[]): Placed[] {
  const items = list
    .map((b) => ({ ...b, start: minutes(b.startTime), end: Math.max(minutes(b.endTime), minutes(b.startTime) + 15), lane: 0, lanes: 1 }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let group: Placed[] = [];
  let groupEnd = -1;
  const close = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; group.forEach((g) => { g.lanes = n; }); };
  for (const item of items) {
    if (group.length && item.start >= groupEnd) { close(); group = []; groupEnd = -1; }
    const used = new Set(group.filter((g) => g.end > item.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    item.lane = lane;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) close();
  return items;
}

/** Minutos bloqueados de un bloqueo dentro de un día (0–1440). */
function blockedRange(t: TimeOffBlock, day: string): [number, number] | null {
  const startDay = t.fromDate;
  const endDay = t.toTime === "00:00" ? addCalendarDays(t.toDate, -1) : t.toDate;
  if (day < startDay || day > endDay) return null;
  const from = day === t.fromDate ? minutes(t.fromTime) : 0;
  const to = day === t.toDate ? minutes(t.toTime) : 1440;
  return to > from ? [from, to] : null;
}

export function PanelWeek({ weekStart, today, timezone, bookings, timeOff, staffList, selectedStaffId, statusFilter, loading, onOpenDay }: Props) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)), [weekStart]);
  const color = useMemo(() => new Map(staffList.map((m, i) => [m.id, STAFF_COLORS[i % STAFF_COLORS.length]])), [staffList]);

  // Las canceladas solo se ven si se filtra por ellas.
  const visible = useMemo(() => bookings.filter((b) =>
    (selectedStaffId === "all" || b.staffId === selectedStaffId)
    && (statusFilter === "all" ? b.status !== "cancelled" : b.status === statusFilter)), [bookings, selectedStaffId, statusFilter]);
  const blocks = useMemo(() => timeOff.filter((t) => selectedStaffId === "all" || t.staffIds.includes(selectedStaffId)), [timeOff, selectedStaffId]);

  const byDay = useMemo(() => new Map(days.map((d) => [d, placeDay(visible.filter((b) => b.date === d))])), [days, visible]);

  // Horas visibles: de 9 a 20 como mínimo, ampliadas para que entren todas las citas.
  const [fromHour, toHour] = useMemo(() => {
    let lo = 9, hi = 20;
    for (const b of visible) {
      lo = Math.min(lo, Math.floor(minutes(b.startTime) / 60));
      hi = Math.max(hi, Math.ceil(Math.max(minutes(b.endTime), minutes(b.startTime) + 15) / 60));
    }
    return [Math.max(0, lo), Math.min(24, hi)];
  }, [visible]);
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const top = (min: number) => ((min - fromHour * 60) / 60) * HOUR_PX;

  // Línea de «ahora» en el día de hoy, actualizada cada minuto.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMin(minutes(timeInTimeZone(new Date(), timezone)));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);

  const summary = (d: string) => {
    const list = visible.filter((b) => b.date === d && (b.status === "confirmed" || b.status === "completed"));
    return { count: list.length, total: list.reduce((s, b) => s + b.priceClp, 0) };
  };
  const staffLabel = (t: TimeOffBlock) =>
    t.staffIds.length === staffList.length && staffList.length > 1 ? "Todo el equipo" : t.staffNames.join(", ");

  return (
    <div className={`wk${loading ? " loading" : ""}`}>
      {staffList.length > 1 && (
        <ul className="wk-legend" aria-label="Colores por profesional">
          {staffList.map((m) => <li key={m.id}><span style={{ background: color.get(m.id) }} />{m.name}</li>)}
        </ul>
      )}

      {/* Escritorio: grilla */}
      <div className="wk-grid" role="grid" aria-label="Agenda de la semana">
        <div className="wk-head" role="row">
          <span className="wk-corner" />
          {days.map((d) => {
            const { weekday, day } = dayChipParts(d);
            const s = summary(d);
            return (
              <button key={d} type="button" role="columnheader" className={`wk-day-head${d === today ? " today" : ""}`} onClick={() => onOpenDay(d)}
                title="Ver el día">
                <span>{weekday}</span>
                <strong>{day}</strong>
                <small>{s.count ? `${s.count} · ${formatPrice(s.total)}` : "—"}</small>
              </button>
            );
          })}
        </div>
        <div className="wk-body" style={{ height: hours.length * HOUR_PX }}>
          <div className="wk-hours" aria-hidden="true">
            {hours.map((h) => <span key={h} style={{ top: (h - fromHour) * HOUR_PX }}>{String(h).padStart(2, "0")}:00</span>)}
          </div>
          {days.map((d) => (
            <div key={d} className={`wk-col${d === today ? " today" : ""}`} role="gridcell">
              {hours.map((h) => <span key={h} className="wk-line" style={{ top: (h - fromHour) * HOUR_PX }} />)}
              {blocks.map((t) => {
                const r = blockedRange(t, d);
                if (!r) return null;
                const from = Math.max(r[0], fromHour * 60);
                const to = Math.min(r[1], toHour * 60);
                if (to <= from) return null;
                return (
                  <div key={t.ids.join()} className="wk-off" style={{ top: top(from), height: top(to) - top(from) }}
                    title={`Bloqueado · ${staffLabel(t)}${t.reason ? ` · ${t.reason}` : ""}`}>
                    <span>{staffLabel(t)}{t.reason ? ` · ${t.reason}` : ""}</span>
                  </div>
                );
              })}
              {byDay.get(d)!.map((b) => (
                <button key={b.id} type="button" onClick={() => onOpenDay(d)}
                  // Citas cortas (menos de 30 min de alto): una sola línea con hora y cliente.
                  className={`wk-ev status-${b.status}${b.overbook ? " overbook" : ""}${top(b.end) - top(b.start) < 34 ? " short" : ""}`}
                  style={{
                    top: top(b.start), height: Math.max(top(b.end) - top(b.start) - 2, 20),
                    left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`, width: `calc(${100 / b.lanes}% - 4px)`,
                    background: color.get(b.staffId) ?? STAFF_COLORS[0],
                  }}
                  title={`${b.startTime}–${b.endTime} · ${b.clientName} · ${b.serviceName} · ${b.staffName}${b.overbook ? " · Sobrecupo" : ""}`}>
                  <strong>{b.startTime} {b.clientName}</strong>
                  <span>{b.serviceName}</span>
                </button>
              ))}
              {d === today && nowMin !== null && nowMin >= fromHour * 60 && nowMin <= toHour * 60 && (
                <span className="wk-now" style={{ top: top(nowMin) }} aria-label="Ahora" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Celular: lista por día */}
      <ol className="wk-list" aria-label="Agenda de la semana">
        {days.map((d) => {
          const { weekday, day, month } = dayChipParts(d);
          const list = byDay.get(d)!;
          const dayBlocks = blocks.filter((t) => blockedRange(t, d));
          return (
            <li key={d} className={d === today ? "today" : undefined}>
              <button type="button" className="wk-list-head" onClick={() => onOpenDay(d)}>
                <span><b>{weekday} {day}</b> {month}{d === today ? " · hoy" : ""}</span>
                <small>{list.length ? `${list.length} ${list.length === 1 ? "cita" : "citas"}` : "Sin citas"}</small>
              </button>
              {dayBlocks.map((t) => {
                const r = blockedRange(t, d)!;
                const label = r[0] === 0 && r[1] === 1440 ? "Todo el día" : `${t.fromDate === d ? t.fromTime : "00:00"}–${r[1] === 1440 ? "24:00" : t.toTime}`;
                return <p key={t.ids.join()} className="wk-list-off"><CalendarOff size={13} /> {label} · {staffLabel(t)}{t.reason ? ` · ${t.reason}` : ""}</p>;
              })}
              {list.map((b) => (
                <button key={b.id} type="button" className={`wk-list-ev status-${b.status}`} onClick={() => onOpenDay(d)}>
                  <span className="wk-dot" style={{ background: color.get(b.staffId) }} />
                  <b>{b.startTime}</b>
                  <span className="wk-list-main">{b.clientName}<small>{b.serviceName} · {b.staffName}</small></span>
                  {b.overbook && <span className="wk-list-tag">Sobrecupo</span>}
                </button>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
