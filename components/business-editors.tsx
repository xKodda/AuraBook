"use client";

// Piezas compartidas entre el asistente de onboarding y las secciones de gestión del panel.

import { useMemo, useState, useTransition } from "react";
import type { OnboardingResult } from "@/app/onboarding/actions";
import { SLOT_INTERVALS, type OnboardingState, type ScheduleDay, type SlotInterval } from "@/lib/types";

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_NAME = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DURATIONS = Array.from({ length: 32 }, (_, i) => (i + 1) * 15);

export { formatDuration } from "@/lib/dates";

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

// Sin horario guardado todo parte vacío: cada negocio marca sus días y elige sus horas (no se proponen por defecto).
function emptyRow(weekday: number): DayRow {
  return { weekday, enabled: false, opens: "", closes: "", hasBreak: false, breakStart: "", breakEnd: "" };
}

/** Filas editables a partir del horario guardado (todas vacías si no hay). */
export function toRows(days: ScheduleDay[] | undefined): DayRow[] {
  return WEEK_ORDER.map((weekday) => {
    const d = days?.find((x) => x.weekday === weekday);
    if (!d) return emptyRow(weekday);
    return {
      weekday, enabled: true, opens: d.opens, closes: d.closes,
      hasBreak: Boolean(d.breakStart), breakStart: d.breakStart ?? "", breakEnd: d.breakEnd ?? "",
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
  if (!r.opens || !r.closes) return "Elige a qué hora abres y cierras.";
  if (r.opens >= r.closes) return "La apertura debe ser antes del cierre.";
  if (r.hasBreak && (!r.breakStart || !r.breakEnd)) return "Elige el inicio y el fin del descanso.";
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
      {!value && <option value="" disabled>--:--</option>}
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

// ─── Intervalo de horas ───

const INTERVAL_LABEL: Record<SlotInterval, { title: string; example: string }> = {
  60: { title: "Cada hora", example: "10:00, 11:00, 12:00…" },
  30: { title: "Cada 30 min", example: "10:00, 10:30, 11:00…" },
  15: { title: "Cada 15 min", example: "10:00, 10:15, 10:30…" },
};

/** Cada cuánto aparecen horas disponibles en la página pública. */
export function SlotIntervalPicker({ value, onChange, disabled }: {
  value: SlotInterval; onChange: (v: SlotInterval) => void; disabled?: boolean;
}) {
  return (
    <fieldset className="onb-field">
      <legend className="field-label">¿Cada cuánto ofreces horas?</legend>
      <div className="onb-chips">
        {SLOT_INTERVALS.map((m) => (
          <button key={m} type="button" className={`onb-chip${value === m ? " selected" : ""}`}
            aria-pressed={value === m} disabled={disabled} onClick={() => onChange(m)}>
            {INTERVAL_LABEL[m].title}
          </button>
        ))}
      </div>
      <small className="field-hint">Tus clientes verán horas como {INTERVAL_LABEL[value].example}</small>
    </fieldset>
  );
}
