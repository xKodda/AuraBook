"use client";

// Reserva agregada por el equipo: clientes que llaman, escriben o llegan sin reservar, y sobrecupos.
// Sugiere las horas libres de la página pública; con «Otra hora» se puede elegir cualquier hora, y si choca
// con otra reserva se puede guardar igual como sobrecupo.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { formatPrice } from "@/lib/dates";
import type { AvailableSlot, PanelBusiness, PanelCatalog } from "@/lib/types";

type Props = {
  business: PanelBusiness;
  catalog: PanelCatalog;
  initialDate: string;
  onClose: () => void;
  onCreated: (date: string) => void;
};

export function PanelNewBooking({ business, catalog, initialDate, onClose, onCreated }: Props) {
  const [serviceId, setServiceId] = useState(catalog.services[0]?.id ?? "");
  const service = catalog.services.find((s) => s.id === serviceId);
  const staffOptions = useMemo(
    () => catalog.staff.filter((m) => service?.staffIds.includes(m.id)),
    [catalog.staff, service],
  );
  const [staffId, setStaffId] = useState(staffOptions[0]?.id ?? "");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  const [otherTime, setOtherTime] = useState(false);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [overbook, setOverbook] = useState(false);
  const [error, setError] = useState<{ text: string; slotTaken?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLSelectElement>(null);

  // Si el profesional elegido no hace el servicio nuevo, se toma el primero que sí lo hace.
  useEffect(() => {
    if (!staffOptions.some((m) => m.id === staffId)) setStaffId(staffOptions[0]?.id ?? "");
  }, [staffOptions, staffId]);

  // Horas libres según la página pública (respeta horario, descansos y reservas). Si no hay, queda «Otra hora».
  useEffect(() => {
    setTime("");
    setSlots(null);
    if (!serviceId || !staffId || !date) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ slug: business.slug, serviceId, date, staffId });
    fetch(`/api/availability?${query}`, { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { slots: [] }))
      .then((data: { slots: AvailableSlot[] }) => {
        const times = [...new Set((data.slots ?? []).map((s) => s.time))];
        setSlots(times);
        if (times.length === 0) setOtherTime(true);
      })
      .catch(() => { if (!controller.signal.aborted) { setSlots([]); setOtherTime(true); } });
    return () => controller.abort();
  }, [business.slug, serviceId, staffId, date]);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(asOverbook = overbook) {
    setError(null);
    if (!time) { setError({ text: "Elige una hora." }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/panel/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: business.id, serviceId, staffId, date, time, name, phone, notes, overbook: asOverbook }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ text: data.error || "No se pudo crear la reserva.", slotTaken: data.code === "SLOT_TAKEN" });
        return;
      }
      onCreated(date);
    } catch {
      setError({ text: "Error de conexión. Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  }

  if (catalog.services.length === 0) {
    return (
      <Shell onClose={onClose}>
        <p className="nb-empty">Primero agrega servicios y asigna quién los atiende en «Mi negocio».</p>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose}>
      <form className="nb-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="onb-field">
          <span className="field-label">Servicio</span>
          <select ref={firstField} className="text-input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {catalog.services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {formatPrice(s.priceClp)}</option>
            ))}
          </select>
        </label>

        <div className="nb-row">
          <label className="onb-field">
            <span className="field-label">Profesional</span>
            <select className="text-input" value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={staffOptions.length === 0}>
              {staffOptions.length === 0 && <option value="">Nadie ofrece este servicio</option>}
              {staffOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="onb-field">
            <span className="field-label">Fecha</span>
            <input type="date" className="text-input" value={date} required onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <fieldset className="onb-field">
          <legend className="field-label">Hora</legend>
          {slots === null ? (
            <p className="nb-muted">Buscando horas libres…</p>
          ) : (
            <>
              {slots.length > 0 && (
                <div className="onb-chips nb-slots">
                  {slots.map((t) => (
                    <button key={t} type="button" className={`onb-chip${!otherTime && time === t ? " selected" : ""}`}
                      onClick={() => { setOtherTime(false); setTime(t); }}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className={`onb-chip nb-other${otherTime ? " selected" : ""}`}
                onClick={() => { setOtherTime(true); setTime(""); }}>
                Otra hora
              </button>
            </>
          )}
          {slots !== null && slots.length === 0 && (
            <p className="nb-muted">No quedan horas libres en la página para ese día. Puedes elegir otra hora.</p>
          )}
          {otherTime && (
            <input type="time" className="text-input nb-time" step={300} value={time} required
              onChange={(e) => setTime(e.target.value)} aria-label="Hora de inicio" />
          )}
        </fieldset>

        <label className="nb-overbook">
          <input type="checkbox" checked={overbook} onChange={(e) => setOverbook(e.target.checked)} />
          <span>
            <b>Sobrecupo</b>
            Agendar aunque la hora ya esté ocupada o quede fuera del horario. Queda marcada en la agenda.
          </span>
        </label>

        <div className="nb-row">
          <label className="onb-field">
            <span className="field-label">Nombre del cliente</span>
            <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80}
              autoComplete="off" />
          </label>
          <label className="onb-field">
            <span className="field-label">Teléfono</span>
            <input className="text-input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required
              placeholder="+56 9 1234 5678" pattern="\+?[\d\s\-]{8,20}" autoComplete="off" />
          </label>
        </div>

        <label className="onb-field">
          <span className="field-label">Nota <span className="nb-optional">opcional</span></span>
          <input className="text-input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}
            placeholder="Ej: llamó por teléfono" />
        </label>

        {error && (
          <div className="form-error nb-error" role="alert">
            <span>{error.text}</span>
            {error.slotTaken && !overbook && (
              <button type="button" className="btn-secondary dash-btn-sm" disabled={saving}
                onClick={() => { setOverbook(true); submit(true); }}>
                <AlertTriangle size={14} /> Agendar como sobrecupo
              </button>
            )}
          </div>
        )}

        <div className="nb-actions">
          <button type="button" className="btn-secondary dash-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary dash-btn" disabled={saving || !staffId}>
            {saving ? "Guardando…" : overbook ? "Agendar sobrecupo" : "Agendar"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="nb-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="nb-dialog" role="dialog" aria-modal="true" aria-labelledby="nb-title">
        <div className="nb-head">
          <div>
            <h2 id="nb-title">Nueva reserva</h2>
            <p>Para clientes que llaman, escriben o llegan sin reservar.</p>
          </div>
          <button type="button" className="nb-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
