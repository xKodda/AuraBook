"use client";

// /admin: transferencias informadas desde «Contratar Premium». Aprobar registra el pago (con el monto que calculó la
// base de datos) y activa Premium con sus adicionales; rechazar no cambia la suscripción.

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { resolvePaymentRequestAction } from "@/app/admin/actions";
import { formatShortDate } from "@/lib/billing";
import { formatPrice } from "@/lib/dates";

export type AdminPaymentRequest = {
  id: string; businessId: string; businessName: string; businessSlug: string; ownerEmail: string | null;
  billingPeriod: "monthly" | "yearly"; months: number; extraStaff: number; amountClp: number;
  method: string; reference: string; status: "pending" | "approved" | "rejected" | "cancelled"; createdAt: string;
};

const STATUS: Record<AdminPaymentRequest["status"], string> = {
  pending: "Por revisar", approved: "Aprobada", rejected: "Rechazada", cancelled: "Cancelada por el negocio",
};

export function AdminPaymentRequests({ requests, onlyPending = false }: { requests: AdminPaymentRequest[]; onlyPending?: boolean }) {
  const [list, setList] = useState(requests);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = onlyPending ? list.filter((r) => r.status === "pending") : list;
  if (shown.length === 0) return null;

  function resolve(r: AdminPaymentRequest, approve: boolean) {
    const question = approve
      ? `¿Confirmas que recibiste ${formatPrice(r.amountClp)} de ${r.businessName}? Se registrará el pago y se activará Premium.`
      : `¿Rechazar la solicitud de ${r.businessName}? No se registrará ningún pago.`;
    if (!window.confirm(question)) return;
    setError(null);
    startTransition(async () => {
      const result = await resolvePaymentRequestAction(r.id, approve);
      if (!result.ok) { setError(result.error); return; }
      setList((cur) => cur.map((x) => (x.id === r.id ? { ...x, status: approve ? "approved" : "rejected" } : x)));
    });
  }

  return (
    <section className="adm-card adm-requests" aria-labelledby="adm-requests-title">
      <div className="adm-card-head"><h2 id="adm-requests-title">Transferencias informadas</h2></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ul>
        {shown.map((r) => (
          <li key={r.id} className={r.status === "pending" ? "pending" : undefined}>
            <div>
              <strong>{r.businessName}</strong> <small>/{r.businessSlug}{r.ownerEmail ? ` · ${r.ownerEmail}` : ""}</small>
              <span>
                Premium {r.billingPeriod === "yearly" ? "anual" : "mensual"}
                {r.extraStaff ? ` + ${r.extraStaff} adicional${r.extraStaff === 1 ? "" : "es"}` : ""} · {formatPrice(r.amountClp)}
                {r.reference ? ` · Op. ${r.reference}` : ""} · {formatShortDate(r.createdAt)}
              </span>
            </div>
            {r.status === "pending" ? (
              <span className="adm-requests-actions">
                <button type="button" className="btn-primary dash-btn-sm" disabled={pending} onClick={() => resolve(r, true)}>
                  <Check size={14} /> Aprobar
                </button>
                <button type="button" className="btn-secondary dash-btn-sm" disabled={pending} onClick={() => resolve(r, false)}>
                  <X size={14} /> Rechazar
                </button>
              </span>
            ) : <span className={`adm-requests-status ${r.status}`}>{STATUS[r.status]}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
