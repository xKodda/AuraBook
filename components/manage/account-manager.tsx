"use client";

// «Mi cuenta»: cambiar contraseña (todos), descargar datos en CSV (owner/admin) y eliminar el negocio (owner).

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, Download, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { changePasswordAction, deleteBusinessAction } from "@/app/dashboard/cuenta/actions";
import { PageHead } from "./common";

type Props = {
  email: string;
  business: { id: string; name: string; slug: string; role: "owner" | "admin" | "staff" };
  lastBusiness: boolean;
};

/** Contraseña con botón para mostrarla (mismo estilo que el inicio de sesión). */
function PasswordInput({ name, value, onChange, autoComplete }: {
  name: string; value: string; onChange: (v: string) => void; autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-wrap">
      <input type={visible ? "text" : "password"} name={name} value={value} onChange={(e) => onChange(e.target.value)}
        required maxLength={72} autoComplete={autoComplete} className="text-input" />
      <button type="button" className="password-toggle" onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}

export function AccountManager({ email, business, lastBusiness }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const manager = business.role !== "staff";
  const owner = business.role === "owner";

  function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    startTransition(async () => {
      const r = await changePasswordAction({ current, next, confirm });
      setPwMessage(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) { setCurrent(""); setNext(""); setConfirm(""); }
    });
  }

  function remove(e: FormEvent) {
    e.preventDefault();
    if (!window.confirm(`¿Eliminar ${business.name} definitivamente? Esta acción no se puede deshacer.`)) return;
    setDeleteError(null);
    startTransition(async () => {
      try {
        // Si sale bien, la acción redirige (al panel o a la página de cuenta eliminada).
        const r = await deleteBusinessAction(confirmSlug);
        if (r && !r.ok) setDeleteError(r.error);
      } catch (err) {
        // `redirect` de Next se propaga como error: no es una falla.
        if (!(err instanceof Error && err.message.includes("NEXT_REDIRECT"))) setDeleteError("Se perdió la conexión. Intenta nuevamente.");
        else throw err;
      }
    });
  }

  const exportUrl = (tipo: "reservas" | "clientes") => `/api/panel/export?businessId=${business.id}&tipo=${tipo}`;

  return (
    <main className="dash-page">
      <PageHead title="Mi cuenta" subtitle={<>Ingresas como <strong>{email}</strong>.</>} />

      <form className="dash-card dash-form" onSubmit={changePassword}>
        <h2><KeyRound size={17} /> Cambiar contraseña</h2>
        <div className="acc-grid">
          <label className="onb-field">
            <span className="field-label">Contraseña actual</span>
            <PasswordInput name="current" value={current} onChange={setCurrent} autoComplete="current-password" />
          </label>
          <label className="onb-field">
            <span className="field-label">Nueva contraseña</span>
            <PasswordInput name="new" value={next} onChange={setNext} autoComplete="new-password" />
          </label>
          <label className="onb-field">
            <span className="field-label">Repite la nueva</span>
            <PasswordInput name="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </label>
        </div>
        <p className="field-hint">Mínimo 8 caracteres.</p>
        {pwMessage && <p className={pwMessage.ok ? "acc-ok" : "form-error"} role="status">{pwMessage.text}</p>}
        <div className="dash-form-foot">
          <span />
          <button type="submit" className="btn-primary dash-btn" disabled={pending || !current || next.length < 8 || !confirm}>
            {pending ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </div>
      </form>

      {manager && (
        <section className="dash-card dash-form">
          <h2><Download size={17} /> Descargar tus datos</h2>
          <p className="acc-text">
            Archivos CSV de {business.name} para abrir en Excel o Google Sheets. Tus datos son tuyos: puedes descargarlos cuando quieras.
          </p>
          <div className="acc-downloads">
            <a href={exportUrl("reservas")} className="btn-secondary dash-btn" download>
              <Download size={15} /> Reservas
            </a>
            <a href={exportUrl("clientes")} className="btn-secondary dash-btn" download>
              <Download size={15} /> Clientes
            </a>
          </div>
          <p className="field-hint">Reservas: todas, con fecha, cliente, servicio, profesional, precio y estado. Clientes: uno por teléfono, con sus reservas y asistencias.</p>
        </section>
      )}

      {owner && (
        <form className="dash-card dash-form acc-danger" onSubmit={remove}>
          <h2><Trash2 size={17} /> Eliminar {business.name}</h2>
          <ul className="acc-list">
            <li>Tu página de reservas deja de funcionar de inmediato y el enlace queda libre.</li>
            <li>Se borran las reservas, los datos de tus clientes, el equipo, los servicios, los horarios y los bloqueos.</li>
            <li>Se conserva solo el registro de pagos de tu plan, sin datos de tus clientes, porque la ley tributaria lo exige.</li>
            {lastBusiness
              ? <li><strong>Es tu único negocio: también se elimina tu cuenta de acceso.</strong></li>
              : <li>Tu cuenta sigue activa con tus otros negocios.</li>}
          </ul>
          <p className="acc-warn"><AlertTriangle size={15} /> Descarga antes tus datos si los quieres conservar. Esta acción no se puede deshacer.</p>
          <label className="onb-field">
            <span className="field-label">Para confirmar, escribe el enlace de tu negocio: <code>{business.slug}</code></span>
            <input className="text-input" value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} autoComplete="off"
              spellCheck={false} placeholder={business.slug} />
          </label>
          {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
          <div className="dash-form-foot">
            <span />
            <button type="submit" className="btn-danger dash-btn" disabled={pending || confirmSlug.trim().toLowerCase() !== business.slug}>
              {pending ? "Eliminando…" : "Eliminar definitivamente"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
