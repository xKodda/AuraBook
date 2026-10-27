import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Mail, MessageSquare } from "lucide-react";
import { METHOD_LABEL, daysUntil, formatShortDate } from "@/lib/billing";
import { getBusinessSubscription, getPublicPlans } from "@/lib/billing-server";
import { formatPrice } from "@/lib/dates";
import { BILLING_CONTACT_EMAIL, BILLING_CONTACT_WHATSAPP } from "@/lib/env";
import { requireManager } from "@/lib/dashboard";
import { FEATURES, TIER_LABEL, staffLimitLabel } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Mi plan | AuraBook",
  robots: { index: false, follow: false },
};

export default async function MyPlanPage() {
  const { business } = await requireManager();
  const [sub, published] = await Promise.all([getBusinessSubscription(business.id), getPublicPlans()]);
  if (!sub) notFound();

  const plan = business.entitlements;
  const premium = published.plans.find((p) => p.code === "premium");
  const days = daysUntil(sub.status === "trial" ? sub.trialEndsAt : sub.paidUntil);
  const overLimit = plan.maxStaff !== null && sub.staffCount > plan.maxStaff;
  const message = `Hola, soy de ${business.name} (aurabook /${business.slug}). Quiero pasarme a Premium.`;

  const badge = sub.status === "trial" ? "Prueba de Premium" : sub.status === "active" ? "Activo" : "Free";
  const headline =
    sub.status === "trial" ? (days !== null && days > 0 ? `Estás probando Premium: te quedan ${days} días` : "Tu prueba de Premium termina hoy")
    : sub.status === "active" ? `Plan ${sub.plan?.name ?? TIER_LABEL[plan.tier]} activo`
    : "Estás en el plan Free";

  return (
    <main className="plan-main dash-page">
        <section className="adm-card plan-hero">
          <span className={`sub-badge sub-${sub.status === "trial" ? "trial" : sub.status === "active" ? "active" : "free"}`}>{badge}</span>
          <h1>{headline}</h1>
          <p className="adm-muted">
            {sub.status === "trial" && `Tu prueba termina el ${formatShortDate(sub.trialEndsAt)}. Después pasas a Free automáticamente, sin cobros ni datos de tarjeta.`}
            {sub.status === "active" && `Pagado hasta el ${formatShortDate(sub.paidUntil)}${days !== null ? ` (${days} días)` : ""}.`}
            {(sub.status === "past_due" || sub.status === "cancelled") &&
              "Tu página de reservas sigue funcionando y tus reservas se mantienen. Con Premium vuelves a tener todo tu equipo y estas funciones."}
          </p>

          <dl className="plan-facts">
            <div><dt>Plan</dt><dd>{TIER_LABEL[plan.tier]}</dd></div>
            <div>
              <dt>Profesionales</dt>
              <dd className={overLimit ? "adm-warn" : undefined}>
                {sub.staffCount}{plan.maxStaff !== null ? ` de ${plan.maxStaff}` : ""}
                {overLimit && " · los demás no aparecen en tu página"}
              </dd>
            </div>
            <div><dt>Negocio</dt><dd>{business.name}</dd></div>
          </dl>

          {plan.tier === "free" || sub.status === "trial" ? (
            (BILLING_CONTACT_WHATSAPP || BILLING_CONTACT_EMAIL) ? (
              <div className="plan-contact">
                {BILLING_CONTACT_WHATSAPP && (
                  <a className="btn-primary" target="_blank" rel="noreferrer"
                    href={`https://wa.me/${BILLING_CONTACT_WHATSAPP}?text=${encodeURIComponent(message)}`}>
                    <MessageSquare size={16} /> Pasar a Premium por WhatsApp
                  </a>
                )}
                {BILLING_CONTACT_EMAIL && (
                  <a className="btn-secondary"
                    href={`mailto:${BILLING_CONTACT_EMAIL}?subject=${encodeURIComponent(`Premium AuraBook · ${business.name}`)}&body=${encodeURIComponent(message)}`}>
                    <Mail size={16} /> Escribir por correo
                  </a>
                )}
              </div>
            ) : (
              <p className="adm-note">Para pasarte a Premium, escríbenos a contacto@clikium.cl.</p>
            )
          ) : null}
        </section>

        <section className="adm-stack">
          <h2 className="plan-section-title">Planes</h2>
          <div className="adm-plans">
            {published.plans.map((p) => {
              const current = p.code === plan.tier;
              return (
                <article key={p.code} className={`adm-plan${current ? " current" : ""}`}>
                  <div className="adm-plan-head">
                    <strong>{p.name}</strong>
                    {current && <span className="sub-badge sub-active">{sub.status === "trial" ? "En prueba" : "Tu plan"}</span>}
                  </div>
                  <span className="adm-plan-price">{formatPrice(p.priceClp)}<small>/mes</small></span>
                  {p.priceYearlyClp ? <small className="adm-muted">o {formatPrice(p.priceYearlyClp)} al año</small> : null}
                  {p.description && <p>{p.description}</p>}
                  <ul>
                    <li><Check size={13} /> {staffLimitLabel(p.maxStaff)}</li>
                    {p.features.map((f) => <li key={f}><Check size={13} /> {FEATURES[f].label}</li>)}
                    {p.code === "free" && <li><Check size={13} /> Página de reservas y panel</li>}
                  </ul>
                </article>
              );
            })}
          </div>
          {premium && <p className="adm-muted plan-fine">Precios en pesos chilenos, IVA incluido. Emitimos boleta o factura (Clikium SpA). Sin renovación automática: pagas solo cuando decides seguir.</p>}
        </section>

        <section className="adm-card">
          <div className="adm-card-head"><h2>Historial de pagos</h2></div>
          {sub.payments.length === 0 ? (
            <p className="adm-empty">Aún no registras pagos.</p>
          ) : (
            <div className="adm-table-wrap">
              {/* En celular cada fila se muestra como ficha (data-label da el nombre de cada dato). */}
              <table className="adm-table pay-table">
                <thead><tr><th>Fecha</th><th>Plan</th><th className="num">Monto</th><th>Cubre hasta</th><th>Medio</th></tr></thead>
                <tbody>
                  {sub.payments.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Fecha">{formatShortDate(p.paidAt)}</td>
                      <td data-label="Plan">{p.planName ?? "—"}{p.months > 1 ? ` × ${p.months} meses` : ""}</td>
                      <td data-label="Monto" className="num">{formatPrice(p.amountClp)}</td>
                      <td data-label="Cubre hasta">{formatShortDate(p.periodEnd)}</td>
                      <td data-label="Medio">{METHOD_LABEL[p.method]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
    </main>
  );
}
