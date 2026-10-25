"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Clock, Pencil, Plus } from "lucide-react";
import { archiveStaffAction, saveServiceAction, saveStaffAction } from "@/app/onboarding/actions";
import { ChoiceField, useBusinessState } from "@/components/business-editors";
import { ROLE_TITLES } from "@/lib/presets";
import { CATEGORY_COPY } from "@/lib/theme";
import type { OnboardingStaff, OnboardingState } from "@/lib/types";
import { PageHead, Saved, scheduleSummary } from "./common";

export function TeamManager({ initial }: { initial: OnboardingState }) {
  const { state, run, pending, error } = useBusinessState(initial);
  const business = state.business!;
  const copy = CATEGORY_COPY[business.category];
  const [editing, setEditing] = useState<OnboardingStaff | "new" | null>(null);
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [linkToMe, setLinkToMe] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const current = editing && editing !== "new" ? editing : null;
  const someoneIsMe = state.staff.some((s) => s.linkedToMe);

  function open(s: OnboardingStaff | "new") {
    setSaved(null);
    setEditing(s);
    setName(s === "new" ? "" : s.name);
    setRoleTitle(s === "new" ? "" : s.roleTitle);
    setLinkToMe(s !== "new" && s.linkedToMe);
    setServiceIds(s === "new"
      ? state.services.map((v) => v.id)
      : state.services.filter((v) => v.staffIds.includes(s.id)).map((v) => v.id));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      let result = await saveStaffAction(business.id, {
        id: current?.id ?? null, name, roleTitle, linkToMe: Boolean((!someoneIsMe || current?.linkedToMe) && linkToMe),
      });
      if (!result.ok) return result;
      // La persona puede ser nueva: se identifica por su nombre en el estado devuelto.
      const staffId = current?.id ?? result.state.staff.find((s) => s.name === name.trim())?.id;
      if (!staffId) return result;
      // Sincroniza los servicios que realiza (cada servicio guarda su lista de profesionales).
      for (const service of result.state.services) {
        const has = service.staffIds.includes(staffId);
        const wants = serviceIds.includes(service.id);
        if (has === wants) continue;
        const staffIds = wants ? [...service.staffIds, staffId] : service.staffIds.filter((id) => id !== staffId);
        if (staffIds.length === 0) continue; // un servicio no puede quedar sin nadie que lo haga
        result = await saveServiceAction(business.id, {
          id: service.id, name: service.name, description: service.description,
          priceClp: service.priceClp, durationMin: service.durationMin, staffIds,
        });
        if (!result.ok) return result;
      }
      return result;
    }, () => { setSaved(`${name.trim()} guardado.`); setEditing(null); });
  }

  function remove(s: OnboardingStaff) {
    if (!window.confirm(`¿Quitar a ${s.name} del equipo? Sus citas pasadas se conservan.`)) return;
    run(() => archiveStaffAction(business.id, s.id), () => { setSaved(`${s.name} ya no aparece en tu página.`); setEditing(null); });
  }

  const toggle = (id: string) =>
    setServiceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <main className="dash-page">
      <PageHead title="Equipo" subtitle="Quienes atienden clientes en tu página de reservas.">
        <button type="button" className="btn-primary dash-btn" onClick={() => open("new")}><Plus size={16} /> Agregar persona</button>
      </PageHead>
      <Saved message={saved} />
      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="dash-card dash-list" aria-label="Personas del equipo">
        {state.staff.length === 0 && <p className="dash-empty">Aún no hay nadie en el equipo.</p>}
        {state.staff.map((s) => {
          const services = state.services.filter((v) => v.staffIds.includes(s.id)).length;
          return (
            <div key={s.id} className="dash-row">
              <span className="bk-avatar dash-avatar">{s.name.charAt(0).toUpperCase()}</span>
              <span className="dash-row-body">
                <strong>{s.name} {s.linkedToMe && <span className="onb-badge">Tú</span>}</strong>
                <small>
                  {s.roleTitle || copy.staffSingular} · {services} {services === 1 ? "servicio" : "servicios"} · {scheduleSummary(state.schedules[s.id])}
                </small>
              </span>
              <span className="dash-row-actions">
                <Link href={`/dashboard/horarios?persona=${s.id}`} className="btn-secondary dash-btn-sm"><Clock size={14} /> Horario</Link>
                <button type="button" className="btn-secondary dash-btn-sm" onClick={() => open(s)} aria-label={`Editar a ${s.name}`}>
                  <Pencil size={14} /> Editar
                </button>
              </span>
            </div>
          );
        })}
      </section>

      {editing && (
        <form className="dash-card dash-form" onSubmit={submit}>
          <h2>{current ? `Editar a ${current.name}` : "Agregar persona"}</h2>
          <label className="onb-field">
            <span className="field-label">Nombre</span>
            <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoFocus />
          </label>
          <ChoiceField key={current?.id ?? "new"} label="Cargo" optional options={ROLE_TITLES[business.category]}
            value={roleTitle} onChange={setRoleTitle} maxLength={60} placeholder={copy.staffSingular} />
          {state.services.length > 0 && (
            <fieldset className="onb-field">
              <legend className="field-label">Servicios que realiza</legend>
              <div className="onb-chips">
                {state.services.map((v) => (
                  <button key={v.id} type="button" className={`onb-chip${serviceIds.includes(v.id) ? " selected" : ""}`}
                    aria-pressed={serviceIds.includes(v.id)} onClick={() => toggle(v.id)}>
                    {serviceIds.includes(v.id) && <Check size={12} />} {v.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {(!someoneIsMe || current?.linkedToMe) && (
            <label className="onb-check">
              <input type="checkbox" checked={linkToMe} onChange={(e) => setLinkToMe(e.target.checked)} />
              <span>Soy yo: también atiendo clientes</span>
            </label>
          )}
          {!current && <p className="field-hint">Después, asígnale su horario en «Horarios» para que aparezca con horas disponibles.</p>}
          <div className="dash-form-foot">
            {current && !current.linkedToMe
              ? <button type="button" className="dash-danger-link" onClick={() => remove(current)} disabled={pending}>Quitar del equipo</button>
              : <span />}
            <span className="dash-form-buttons">
              <button type="button" className="btn-secondary dash-btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="btn-primary dash-btn" disabled={pending || name.trim().length < 2}>
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </span>
          </div>
        </form>
      )}
    </main>
  );
}
