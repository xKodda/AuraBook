"use client";

import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { archiveServiceAction, saveServiceAction } from "@/app/onboarding/actions";
import { ChoiceField, DURATIONS, formatDuration, useBusinessState } from "@/components/business-editors";
import { formatPrice } from "@/lib/dates";
import { SERVICE_PRESETS } from "@/lib/presets";
import type { OnboardingService, OnboardingState } from "@/lib/types";
import { PageHead, Saved } from "./common";

export function ServicesManager({ initial }: { initial: OnboardingState }) {
  const { state, run, pending, error } = useBusinessState(initial);
  const business = state.business!;
  const [editing, setEditing] = useState<OnboardingService | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState("");
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  const current = editing && editing !== "new" ? editing : null;
  const priceClp = Number(price.replace(/\D/g, "") || "NaN");
  const staffName = (id: string) => state.staff.find((s) => s.id === id)?.name ?? "";
  const presets = SERVICE_PRESETS[business.category]
    .filter((p) => !state.services.some((s) => s.name === p.name && s.id !== current?.id));

  function open(s: OnboardingService | "new") {
    setSaved(null);
    setEditing(s);
    setName(s === "new" ? "" : s.name);
    setDescription(s === "new" ? "" : s.description);
    setDuration(s === "new" ? 30 : s.durationMin);
    setPrice(s === "new" ? "" : String(s.priceClp));
    setStaffIds(s === "new" ? state.staff.map((x) => x.id) : s.staffIds);
  }

  const toggle = (id: string) =>
    setStaffIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  function submit(e: FormEvent) {
    e.preventDefault();
    run(() => saveServiceAction(business.id, {
      id: current?.id ?? null, name, description, priceClp, durationMin: duration,
      staffIds: state.staff.length === 1 ? [state.staff[0].id] : staffIds,
    }), () => { setSaved(`«${name.trim()}» guardado.`); setEditing(null); });
  }

  function remove(s: OnboardingService) {
    if (!window.confirm(`¿Quitar «${s.name}»? Las citas ya reservadas se mantienen.`)) return;
    run(() => archiveServiceAction(business.id, s.id), () => { setSaved(`«${s.name}» ya no aparece en tu página.`); setEditing(null); });
  }

  const canSubmit = name.trim().length >= 2 && Number.isFinite(priceClp) && (state.staff.length === 1 || staffIds.length > 0);

  return (
    <main className="dash-page">
      <PageHead title="Servicios" subtitle="Lo que tus clientes pueden reservar, en este orden.">
        <button type="button" className="btn-primary dash-btn" onClick={() => open("new")}><Plus size={16} /> Agregar servicio</button>
      </PageHead>
      <Saved message={saved} />
      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="dash-card dash-list" aria-label="Servicios">
        {state.services.length === 0 && <p className="dash-empty">Aún no hay servicios.</p>}
        {state.services.map((s) => (
          <div key={s.id} className={`dash-row${current?.id === s.id ? " editing" : ""}`}>
            <span className="dash-row-body">
              <strong>{s.name}</strong>
              <small>{s.staffIds.map(staffName).filter(Boolean).join(", ") || "Sin profesional asignado"}</small>
            </span>
            <span className="dash-row-meta">{formatDuration(s.durationMin)}</span>
            <strong className="dash-row-price">{formatPrice(s.priceClp)}</strong>
            <button type="button" className="btn-secondary dash-btn-sm" onClick={() => open(s)} aria-label={`Editar ${s.name}`}>
              <Pencil size={14} /> Editar
            </button>
          </div>
        ))}
      </section>

      {editing && (
        <form className="dash-card dash-form" onSubmit={submit}>
          <h2>{current ? `Editar «${current.name}»` : "Nuevo servicio"}</h2>
          <ChoiceField key={current?.id ?? "new"} label="Servicio" options={presets.map((p) => p.name)} value={name}
            onChange={setName} maxLength={120} placeholder="Nombre del servicio"
            onPick={(v) => { const p = presets.find((x) => x.name === v); if (p && !current) setDuration(p.durationMin); }} />
          <div className="onb-grid-2">
            <label className="onb-field">
              <span className="field-label">Duración</span>
              <select className="text-input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => <option key={d} value={d}>{formatDuration(d)}</option>)}
              </select>
            </label>
            <label className="onb-field">
              <span className="field-label">Precio (CLP)</span>
              <input className="text-input" value={price} inputMode="numeric" required placeholder="12000"
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
              <small className="field-hint">{Number.isFinite(priceClp) ? formatPrice(priceClp) : " "}</small>
            </label>
          </div>
          <label className="onb-field">
            <span className="field-label">Descripción <em className="onb-optional">opcional</em></span>
            <input className="text-input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="Qué incluye" />
          </label>
          {state.staff.length > 1 && (
            <fieldset className="onb-field">
              <legend className="field-label">¿Quién lo realiza?</legend>
              <div className="onb-chips">
                {state.staff.map((s) => (
                  <button key={s.id} type="button" className={`onb-chip${staffIds.includes(s.id) ? " selected" : ""}`}
                    aria-pressed={staffIds.includes(s.id)} onClick={() => toggle(s.id)}>
                    {staffIds.includes(s.id) && <Check size={12} />} {s.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {current && <p className="field-hint">Cambiar el precio o la duración no modifica las citas ya reservadas.</p>}
          <div className="dash-form-foot">
            {current
              ? <button type="button" className="dash-danger-link" onClick={() => remove(current)} disabled={pending}>Quitar servicio</button>
              : <span />}
            <span className="dash-form-buttons">
              <button type="button" className="btn-secondary dash-btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="btn-primary dash-btn" disabled={pending || !canSubmit}>{pending ? "Guardando…" : "Guardar"}</button>
            </span>
          </div>
        </form>
      )}
    </main>
  );
}
