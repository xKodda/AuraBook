"use client";

// Piezas compartidas entre el asistente de onboarding y las secciones de gestión del panel.

import { useMemo, useState, useTransition } from "react";
import type { OnboardingResult } from "@/app/onboarding/actions";
import type { OnboardingState, ScheduleDay } from "@/lib/types";

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_NAME = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DURATIONS = Array.from({ length: 32 }, (_, i) => (i + 1) * 15);

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function timeOptions(current: string[]): string[] {
  const base: string[] = [];
  for (let m = 6 * 60; m <= 23 * 60 + 30; m += 30) {
    base.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return [...new Set([...base, ...current.filter(Boolean)])].sort();
}

/** Ejecuta acciones del servidor que devuelven el estado del negocio y lo mantiene actualizado. */
export function useBusinessState(initial: OnboardingState) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<OnboardingResult>, onOk?: (next: OnboardingState) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setState(result.state);
        onOk?.(result.state);
      } catch {
        setError("Se perdió la conexión. Revisa tu internet e intenta nuevamente.");
      }
    });
  }

  return { state, run, pending, error, setError };
}

/**
 * Elegir entre opciones sugeridas o escribir otra. `value` vacío = nada elegido.
 * Si el valor guardado no está entre las opciones, se muestra como «Otro».
 */
export function ChoiceField({ label, options, value, onChange, optional, placeholder, maxLength, onPick }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
  optional?: boolean; placeholder: string; maxLength: number; onPick?: (v: string) => void;
}) {
  const [custom, setCustom] = useState(() => value !== "" && !options.includes(value));
  const isCustom = custom || (value !== "" && !options.includes(value));
  return (
    <fieldset className="onb-field">
      <legend className="field-label">
        {label} {optional && <em className="onb-optional">opcional</em>}
      </legend>
      <div className="onb-chips">
        {options.map((o) => (
          <button key={o} type="button" className={`onb-chip${!isCustom && value === o ? " selected" : ""}`}
            aria-pressed={!isCustom && value === o}
            onClick={() => {
              setCustom(false);
              const next = optional && value === o ? "" : o;
              onChange(next);
              if (next) onPick?.(next);
            }}>
            {o}
          </button>
        ))}
        <button type="button" className={`onb-chip${isCustom ? " selected" : ""}`} aria-pressed={isCustom}
          onClick={() => { setCustom(true); if (options.includes(value)) onChange(""); }}>
          Otro…
        </button>
      </div>
      {isCustom && (
        <input className="text-input" value={value} onChange={(e) => onChange(e.target.value)} autoFocus
          maxLength={maxLength} placeholder={placeholder} aria-label={label} />
      )}
    </fieldset>
  );
}

// ─── Horario semanal ───

export type DayRow = {
  weekday: number; enabled: boolean; opens: string; closes: string;
  hasBreak: boolean; breakStart: string; breakEnd: string;
};

function defaultRow(weekday: number): DayRow {
  const weekdayRow = weekday >= 1 && weekday <= 5;
  return {
    weekday,
    enabled: weekday !== 0,
    opens: "10:00",
    closes: weekday === 6 ? "14:00" : "19:00",
    hasBreak: weekdayRow,
    breakStart: "14:00",
    breakEnd: "15:00",
  };
}

/** Filas editables a partir del horario guardado (o una propuesta por defecto si no hay). */
export function toRows(days: ScheduleDay[] | undefined): DayRow[] {
  return WEEK_ORDER.map((weekday) => {
    if (!days) return defaultRow(weekday);
    const d = days.find((x) => x.weekday === weekday);
    if (!d) return { ...defaultRow(weekday), enabled: false };
    return {
      weekday, enabled: true, opens: d.opens, closes: d.closes,
      hasBreak: Boolean(d.breakStart), breakStart: d.breakStart ?? "14:00", breakEnd: d.breakEnd ?? "15:00",
    };
  });
}

export function rowsToDays(rows: DayRow[]) {
  return rows.filter((r) => r.enabled).map((r) => ({
    weekday: r.weekday, opens: r.opens, closes: r.closes,
    breakStart: r.hasBreak ? r.breakStart : null, breakEnd: r.hasBreak ? r.breakEnd : null,
  }));
}

function rowError(r: DayRow): string | null {
  if (!r.enabled) return null;
  if (r.opens >= r.closes) return "La apertura debe ser antes del cierre.";
  if (r.hasBreak && (r.breakStart >= r.breakEnd || r.breakStart < r.opens || r.breakEnd > r.closes)) {
    return "El descanso debe quedar dentro de la jornada.";
  }
  return null;
}

export const rowsInvalid = (rows: DayRow[]) => rows.some((r) => rowError(r)) || !rows.some((r) => r.enabled);

/** Editor de los 7 días con apertura, cierre y descanso opcional. */
export function WeekRows({ rows, onChange }: { rows: DayRow[]; onChange: (rows: DayRow[]) => void }) {
  const options = useMemo(
    () => timeOptions(rows.flatMap((r) => [r.opens, r.closes, r.breakStart, r.breakEnd])),
    [rows],
  );
  const patch = (weekday: number, change: Partial<DayRow>) =>
    onChange(rows.map((r) => (r.weekday === weekday ? { ...r, ...change } : r)));

  function copyMondayToAll() {
    const monday = rows.find((r) => r.weekday === 1)!;
    onChange(rows.map((r) => (r.enabled && r.weekday !== 1
      ? { ...r, opens: monday.opens, closes: monday.closes, hasBreak: monday.hasBreak,
          breakStart: monday.breakStart, breakEnd: monday.breakEnd }
      : r)));
  }

  const select = (value: string, set: (v: string) => void, label: string) => (
    <select className="onb-time" value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
      {options.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );

  return (
    <>
      <div className="onb-days">
        {rows.map((r) => {
          const err = rowError(r);
          return (
            <div key={r.weekday} className={`onb-day${r.enabled ? "" : " off"}`}>
              <label className="onb-day-toggle">
                <input type="checkbox" checked={r.enabled} onChange={(e) => patch(r.weekday, { enabled: e.target.checked })} />
                <span>{DAY_NAME[r.weekday]}</span>
              </label>
              {r.enabled ? (
                <div className="onb-day-times">
                  <span className="onb-range">
                    {select(r.opens, (v) => patch(r.weekday, { opens: v }), `Apertura ${DAY_NAME[r.weekday]}`)}
                    <span>a</span>
                    {select(r.closes, (v) => patch(r.weekday, { closes: v }), `Cierre ${DAY_NAME[r.weekday]}`)}
                  </span>
                  <label className="onb-check small">
                    <input type="checkbox" checked={r.hasBreak} onChange={(e) => patch(r.weekday, { hasBreak: e.target.checked })} />
                    <span>Descanso</span>
                  </label>
                  {r.hasBreak && (
                    <span className="onb-range">
                      {select(r.breakStart, (v) => patch(r.weekday, { breakStart: v }), `Inicio descanso ${DAY_NAME[r.weekday]}`)}
                      <span>a</span>
                      {select(r.breakEnd, (v) => patch(r.weekday, { breakEnd: v }), `Fin descanso ${DAY_NAME[r.weekday]}`)}
                    </span>
                  )}
                  {err && <small className="onb-bad onb-day-error">{err}</small>}
                </div>
              ) : (
                <span className="onb-day-closed">Cerrado</span>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="onb-link-btn" onClick={copyMondayToAll}>
        Copiar el horario del lunes a los demás días abiertos
      </button>
    </>
  );
}
