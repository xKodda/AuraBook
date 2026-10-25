"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import { saveScheduleAction } from "@/app/onboarding/actions";
import { WeekRows, rowsInvalid, rowsToDays, toRows, useBusinessState, type DayRow } from "@/components/business-editors";
import type { OnboardingState } from "@/lib/types";
import { PageHead, Saved, scheduleSummary } from "./common";

export function ScheduleManager({ initial, initialStaffId }: { initial: OnboardingState; initialStaffId?: string }) {
  const { state, run, pending, error } = useBusinessState(initial);
  const business = state.business!;
  const firstId = state.staff.find((s) => s.id === initialStaffId)?.id ?? state.staff[0]?.id ?? "";
  const [staffId, setStaffId] = useState(firstId);
  const [rows, setRows] = useState<DayRow[]>(() => toRows(state.schedules[firstId]));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const person = state.staff.find((s) => s.id === staffId);
  const others = state.staff.filter((s) => s.id !== staffId);

  function pick(id: string) {
    if (dirty && !window.confirm("Tienes cambios sin guardar. ¿Descartarlos?")) return;
    setStaffId(id);
    setRows(toRows(state.schedules[id]));
    setDirty(false);
    setSaved(null);
  }

  function save(targetIds: string[], label: string) {
    run(() => saveScheduleAction(business.id, { staffIds: targetIds, days: rowsToDays(rows) }), () => {
      setDirty(false);
      setSaved(label);
    });
  }

  if (state.staff.length === 0) {
    return (
      <main className="dash-page">
        <PageHead title="Horarios" />
        <p className="dash-empty dash-card">Primero agrega a alguien en <Link href="/dashboard/equipo">Equipo</Link>.</p>
      </main>
    );
  }

  return (
    <main className="dash-page">
      <PageHead title="Horarios" subtitle="El horario habitual de cada persona. Los clientes solo reservan dentro de él." />
      <Saved message={saved} />
      {error && <div className="form-error" role="alert">{error}</div>}

      {state.staff.length > 1 && (
        <div className="onb-chips" role="tablist" aria-label="Persona">
          {state.staff.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === staffId}
              className={`onb-chip${s.id === staffId ? " selected" : ""}`} onClick={() => pick(s.id)}>
              {s.name} <span className="dash-chip-sub">{scheduleSummary(state.schedules[s.id])}</span>
            </button>
          ))}
        </div>
      )}

      <section className="dash-card dash-form">
        <h2>Horario de {person?.name}</h2>
        {!state.schedules[staffId]?.length && (
          <p className="field-hint">{person?.name} aún no tiene horario: te proponemos uno para que lo ajustes.</p>
        )}
        <WeekRows rows={rows} onChange={(next) => { setRows(next); setDirty(true); }} />
        <div className="dash-form-foot">
          {others.length > 0 ? (
            <button type="button" className="btn-secondary dash-btn" disabled={pending || rowsInvalid(rows)}
              onClick={() => save(others.map((o) => o.id), `Horario copiado a ${others.map((o) => o.name).join(", ")}.`)}>
              <Copy size={15} /> Copiar a {others.length === 1 ? others[0].name : "todo el equipo"}
            </button>
          ) : <span />}
          <button type="button" className="btn-primary dash-btn" disabled={pending || rowsInvalid(rows)}
            onClick={() => save([staffId], `Horario de ${person?.name} guardado.`)}>
            {pending ? "Guardando…" : "Guardar horario"}
          </button>
        </div>
      </section>
    </main>
  );
}
