"use client";

// Bloqueos de agenda: días completos (vacaciones, feriados) o algunas horas (trámites, imprevistos),
// para todo el equipo o para algunas personas. Un bloqueo no cancela reservas: avisa cuántas quedan dentro.

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CalendarOff, Plus, Trash2 } from "lucide-react";
import { deleteTimeOffAction, saveTimeOffAction, type TimeOffResult } from "@/app/dashboard/bloqueos/actions";
import { ChoiceField } from "@/components/business-editors";
import { addCalendarDays, formatDateRange } from "@/lib/dates";
import type { TimeOffBlock } from "@/lib/types";
import { PageHead, Saved } from "./common";

const REASONS = ["Vacaciones", "Feriado", "Trámite", "Capacitación"];

function blockWhen(b: TimeOffBlock): string {
  if (b.allDay) {
    const last = addCalendarDays(b.toDate, -1);
    return `${formatDateRange(b.fromDate, last)} · todo el día`;
  }
  const sameDay = b.fromDate === b.toDate || b.toTime === "00:00";
  return sameDay
    ? `${formatDateRange(b.fromDate, b.fromDate)} · ${b.fromTime} a ${b.toTime === "00:00" ? "24:00" : b.toTime}`
    : `${formatDateRange(b.fromDate, b.fromDate)} ${b.fromTime} – ${formatDateRange(b.toDate, b.toDate)} ${b.toTime}`;
}

export function TimeOffManager({ initial, staff, today }: {
  initial: TimeOffBlock[]; staff: { id: string; name: string }[]; today: string;
}) {
  const [blocks, setBlocks] = useState(initial);
  const [open, setOpen] = useState(initial.length === 0);
  const [staffIds, setStaffIds] = useState<string[]>(staff.map((m) => m.id));
  const [allDay, setAllDay] = useState(true);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [fromTime, setFromTime] = useState("13:00");
  const [toTime, setToTime] = useState("15:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [affected, setAffected] = useState(0);
  const [pending, startTransition] = useTransition();

  const everyone = staffIds.length === staff.length;

  // «Hasta» nunca queda antes de «Desde», aunque se cambie el día en «Algunas horas».
  function changeFrom(value: string) {
    setFromDate(value);
    setToDate((to) => (to < value ? value : to));
  }

  function resetForm() {
    setStaffIds(staff.map((m) => m.id));
    setAllDay(true);
    setFromDate(today);
    setToDate(today);
    setReason("");
  }
  const names = new Map(staff.map((m) => [m.id, m.name]));

  function apply(result: TimeOffResult, message: string) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBlocks(result.blocks);
    setAffected(result.affected);
    setSaved(message);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    if (staffIds.length === 0) {
      setError("Elige al menos a una persona.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveTimeOffAction({ staffIds, allDay, fromDate, toDate: allDay ? toDate : fromDate, fromTime, toTime, reason });
        apply(result, "Bloqueo guardado. Esas horas ya no se ofrecen en tu página.");
        if (result.ok) {
          setOpen(false);
          resetForm();
        }
      } catch {
        setError("Se perdió la conexión. Intenta nuevamente.");
      }
    });
  }

  function remove(b: TimeOffBlock) {
    if (!window.confirm("¿Quitar este bloqueo? Esas horas vuelven a estar disponibles en tu página.")) return;
    setError(null);
    startTransition(async () => {
      try {
        apply(await deleteTimeOffAction(b.ids), "Bloqueo quitado.");
        setAffected(0);
      } catch {
        setError("Se perdió la conexión. Intenta nuevamente.");
      }
    });
  }

  const toggle = (id: string) => setStaffIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <main className="dash-page">
      <PageHead title="Bloqueos" subtitle="Días u horas en que no se puede reservar: vacaciones, feriados o imprevistos.">
        {!open && (
          <button type="button" className="btn-primary dash-btn" onClick={() => { setOpen(true); setSaved(null); }}>
            <Plus size={16} /> Bloquear horario
          </button>
        )}
      </PageHead>
      <Saved message={saved} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {affected > 0 && (
        <p className="plan-note to-warning">
          <AlertTriangle size={15} /> Hay {affected} {affected === 1 ? "reserva confirmada" : "reservas confirmadas"} dentro de este bloqueo.
          No se cancelan solas: revisa la agenda y avisa a {affected === 1 ? "ese cliente" : "esos clientes"}.
        </p>
      )}

      {open && (
        <form className="dash-card dash-form" onSubmit={submit}>
          <h2>Nuevo bloqueo</h2>

          <fieldset className="onb-field">
            <legend className="field-label">¿Quién no atiende?</legend>
            <div className="onb-chips">
              {staff.length > 1 && (
                <button type="button" className={`onb-chip${everyone ? " selected" : ""}`} aria-pressed={everyone}
                  onClick={() => setStaffIds(everyone ? [] : staff.map((m) => m.id))}>
                  Todo el equipo
                </button>
              )}
              {staff.map((m) => (
                <button key={m.id} type="button" className={`onb-chip${staffIds.includes(m.id) && (!everyone || staff.length === 1) ? " selected" : ""}`}
                  aria-pressed={staffIds.includes(m.id)} onClick={() => (everyone && staff.length > 1 ? setStaffIds([m.id]) : toggle(m.id))}>
                  {m.name}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rev-seg to-seg" role="radiogroup" aria-label="Tipo de bloqueo">
            <button type="button" role="radio" aria-checked={allDay} className={allDay ? "active" : undefined} onClick={() => setAllDay(true)}>
              Días completos
            </button>
            <button type="button" role="radio" aria-checked={!allDay} className={!allDay ? "active" : undefined} onClick={() => setAllDay(false)}>
              Algunas horas
            </button>
          </div>

          {allDay ? (
            <div className="onb-grid-2">
              <label className="onb-field">
                <span className="field-label">Desde</span>
                <input type="date" className="text-input" value={fromDate} min={today} required onChange={(e) => changeFrom(e.target.value)} />
              </label>
              <label className="onb-field">
                <span className="field-label">Hasta (inclusive)</span>
                <input type="date" className="text-input" value={toDate} min={fromDate} required onChange={(e) => setToDate(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="to-hours">
              <label className="onb-field">
                <span className="field-label">Día</span>
                <input type="date" className="text-input" value={fromDate} min={today} required onChange={(e) => changeFrom(e.target.value)} />
              </label>
              <label className="onb-field">
                <span className="field-label">Desde</span>
                <input type="time" className="text-input" step={900} value={fromTime} required onChange={(e) => setFromTime(e.target.value)} />
              </label>
              <label className="onb-field">
                <span className="field-label">Hasta</span>
                <input type="time" className="text-input" step={900} value={toTime} required onChange={(e) => setToTime(e.target.value)} />
              </label>
            </div>
          )}

          <ChoiceField label="Motivo" options={REASONS} value={reason} onChange={setReason} optional
            placeholder="Ej: control médico" maxLength={80} />

          <div className="dash-form-foot">
            <span />
            <span className="dash-form-buttons">
              {blocks.length > 0 && <button type="button" className="btn-secondary dash-btn" onClick={() => setOpen(false)}>Cancelar</button>}
              <button type="submit" className="btn-primary dash-btn" disabled={pending}>{pending ? "Guardando…" : "Guardar bloqueo"}</button>
            </span>
          </div>
        </form>
      )}

      <section className="dash-card dash-list" aria-label="Bloqueos próximos">
        {blocks.length === 0 && (
          <p className="dash-empty to-empty"><CalendarOff size={18} /> No tienes bloqueos próximos. Tu agenda sigue tu horario habitual.</p>
        )}
        {blocks.map((b) => (
          <div key={b.ids.join()} className="dash-row">
            <span className="dash-row-body">
              <strong>{blockWhen(b)}</strong>
              <small>
                {b.staffIds.length === staff.length && staff.length > 1 ? "Todo el equipo" : b.staffIds.map((id) => names.get(id) ?? "—").join(", ")}
                {b.reason ? ` · ${b.reason}` : ""}
              </small>
            </span>
            <span className="dash-row-actions">
              <button type="button" className="btn-secondary dash-btn-sm" onClick={() => remove(b)} disabled={pending} aria-label={`Quitar bloqueo ${blockWhen(b)}`}>
                <Trash2 size={14} /> Quitar
              </button>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
