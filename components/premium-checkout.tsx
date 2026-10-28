"use client";

// «Contratar Premium»: periodicidad, profesionales adicionales y forma de pago. El total que se muestra es una
// referencia; el monto real lo calcula la base de datos al crear la solicitud (premium_quote).

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Check, Clock, CreditCard, Minus, Plus } from "lucide-react";
import { cancelPremiumRequestAction, requestPremiumAction } from "@/app/dashboard/plan/actions";
import type { PendingPaymentRequest } from "@/lib/billing-server";
import { formatPrice } from "@/lib/dates";
import type { PublicPlan } from "@/lib/plans";

type Bank = { holder: string; rut: string; bank: string; accountType: string; accountNumber: string; email: string };

export function PremiumCheckout({ premium, staffCount, pending, bank, businessName }: {
  premium: PublicPlan; staffCount: number; pending: PendingPaymentRequest | null; bank: Bank; businessName: string;
}) {
  const included = premium.maxStaff ?? 3;
  const maxExtra = premium.maxExtraStaff ?? 0;
  const extraPrice = premium.extraStaffPriceClp ?? 0;
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [extra, setExtra] = useState(Math.min(maxExtra, Math.max(0, staffCount - included)));
  const [reference, setReference] = useState("");
  const [request, setRequest] = useState(pending);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, startTransition] = useTransition();

  const base = period === "yearly" ? premium.priceYearlyClp ?? premium.priceClp * 12 : premium.priceClp;
  const extras = extra * extraPrice * (period === "yearly" ? 12 : 1);
  const total = base + extras;
  const bankReady = Boolean(bank.bank && bank.accountNumber);

  function send() {
    setError(null);
    startTransition(async () => {
      const r = await requestPremiumAction({ period, extraStaff: extra, reference });
      if (!r.ok) { setError(r.error); return; }
      setRequest({ id: "", billingPeriod: period, extraStaff: extra, amountClp: r.amountClp, reference, createdAt: new Date().toISOString() });
    });
  }

  function cancel() {
    if (!window.confirm("¿Cancelar tu solicitud? Si ya transferiste, escríbenos para revisarlo.")) return;
    startTransition(async () => {
      const r = await cancelPremiumRequestAction();
      if (!r.ok) { setError(r.error); return; }
      setRequest(null);
    });
  }

  if (request) {
    return (
      <section className="dash-card co-done">
        <span className="success-icon"><Clock size={28} /></span>
        <h2>Estamos revisando tu transferencia</h2>
        <p>
          Recibimos tu aviso de pago de <strong>{formatPrice(request.amountClp)}</strong> para Premium{" "}
          {request.billingPeriod === "yearly" ? "anual" : "mensual"}
          {request.extraStaff ? ` con ${request.extraStaff} profesional${request.extraStaff === 1 ? "" : "es"} adicional${request.extraStaff === 1 ? "" : "es"}` : ""}.
          Activaremos Premium apenas confirmemos el pago, normalmente dentro de 1 día hábil. Te avisaremos por correo.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="co-done-actions">
          <Link href="/dashboard/plan" className="btn-secondary dash-btn"><ArrowLeft size={15} /> Volver a «Mi plan»</Link>
          <button type="button" className="onb-link-btn" onClick={cancel} disabled={pendingAction}>Cancelar solicitud</button>
        </div>
      </section>
    );
  }

  return (
    <div className="co">
      <section className="dash-card dash-form">
        <h2>1. Elige cómo pagar</h2>
        <div className="co-periods" role="radiogroup" aria-label="Periodicidad">
          {(["monthly", "yearly"] as const).map((p) => {
            const price = p === "yearly" ? premium.priceYearlyClp ?? premium.priceClp * 12 : premium.priceClp;
            const saving = p === "yearly" && premium.priceYearlyClp ? premium.priceClp * 12 - premium.priceYearlyClp : 0;
            return (
              <button key={p} type="button" role="radio" aria-checked={period === p} className={`co-period${period === p ? " selected" : ""}`}
                onClick={() => setPeriod(p)}>
                <span>{p === "yearly" ? "Anual" : "Mensual"}</span>
                <strong>{formatPrice(price)}</strong>
                <small>{p === "yearly" ? `al año${saving ? ` · ahorras ${formatPrice(saving)}` : ""}` : "al mes"}</small>
              </button>
            );
          })}
        </div>

        <h2>2. Tu equipo</h2>
        <div className="co-staff">
          <div>
            <strong>{included} profesionales incluidos</strong>
            <small>Tienes {staffCount} activos. Cada adicional suma {formatPrice(extraPrice)} al mes (hasta {included + maxExtra} en total).</small>
          </div>
          <div className="co-stepper" aria-label="Profesionales adicionales">
            <button type="button" onClick={() => setExtra((n) => Math.max(0, n - 1))} disabled={extra === 0} aria-label="Quitar uno"><Minus size={16} /></button>
            <span aria-live="polite">{extra} adicional{extra === 1 ? "" : "es"}</span>
            <button type="button" onClick={() => setExtra((n) => Math.min(maxExtra, n + 1))} disabled={extra >= maxExtra} aria-label="Agregar uno"><Plus size={16} /></button>
          </div>
        </div>
      </section>

      <section className="dash-card dash-form">
        <h2>3. Paga</h2>
        <div className="co-method selected">
          <Building2 size={20} />
          <div>
            <strong>Transferencia bancaria</strong>
            {bankReady ? (
              <dl className="co-bank">
                <div><dt>Titular</dt><dd>{bank.holder}</dd></div>
                <div><dt>RUT</dt><dd>{bank.rut}</dd></div>
                <div><dt>Banco</dt><dd>{bank.bank}</dd></div>
                <div><dt>Cuenta</dt><dd>{bank.accountType ? `${bank.accountType} ` : ""}{bank.accountNumber}</dd></div>
                <div><dt>Correo</dt><dd>{bank.email}</dd></div>
                <div><dt>Asunto</dt><dd>Premium {businessName}</dd></div>
              </dl>
            ) : (
              <p className="co-muted">Escríbenos a <a href={`mailto:${bank.email}`}>{bank.email}</a> y te enviamos los datos de la cuenta de {bank.holder}.</p>
            )}
            <label className="onb-field co-ref">
              <span className="field-label">N° de operación <span className="onb-optional">opcional</span></span>
              <input className="text-input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120}
                placeholder="Nos ayuda a encontrar tu pago" />
            </label>
          </div>
        </div>
        <div className="co-method disabled" aria-disabled="true">
          <CreditCard size={20} />
          <div>
            <strong>Tarjeta de crédito o débito <span className="pr-soon">Próximamente</span></strong>
            <p className="co-muted">Pronto podrás pagar con tarjeta directamente aquí.</p>
          </div>
        </div>

        <div className="co-summary">
          <div>
            <span>Premium {period === "yearly" ? "anual" : "mensual"}</span><b>{formatPrice(base)}</b>
          </div>
          {extra > 0 && (
            <div>
              <span>{extra} profesional{extra === 1 ? "" : "es"} adicional{extra === 1 ? "" : "es"}{period === "yearly" ? " × 12 meses" : ""}</span>
              <b>{formatPrice(extras)}</b>
            </div>
          )}
          <div className="co-total"><span>Total, IVA incluido</span><b>{formatPrice(total)}</b></div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="co-muted">
          Al avisar tu transferencia no se activa nada todavía: lo hacemos al confirmar el pago. Emitimos boleta o factura (Clikium SpA).
          Sin renovación automática.
        </p>
        <div className="dash-form-foot">
          <Link href="/dashboard/plan" className="onb-link-btn">Volver</Link>
          <button type="button" className="btn-primary dash-btn" onClick={send} disabled={pendingAction}>
            <Check size={16} /> {pendingAction ? "Enviando…" : "Ya transferí, avisar"}
          </button>
        </div>
      </section>
    </div>
  );
}
