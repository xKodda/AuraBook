import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Mail, MessageSquare } from "lucide-react";
import { METHOD_LABEL, STATUS_LABEL, daysUntil, formatShortDate } from "@/lib/billing";
import { getBusinessSubscription } from "@/lib/billing-server";
import { formatPrice } from "@/lib/dates";
import { BILLING_CONTACT_EMAIL, BILLING_CONTACT_WHATSAPP } from "@/lib/env";
import { requireManager } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Mi plan | AuraBook",
  robots: { index: false, follow: false },
};

export default async function MyPlanPage() {
  const { business } = await requireManager();
  const sub = await getBusinessSubscription(business.id);
  if (!sub) notFound();

  const endsAt = sub.status === "trial" ? sub.trialEndsAt : sub.paidUntil;
  const days = daysUntil(endsAt);
  const overLimit = sub.plan?.maxStaff != null && sub.staffCount > sub.plan.maxStaff;
  const message = `Hola, soy de ${business.name} (aurabook /${business.slug}). Quiero pagar o cambiar mi plan.`;

  const headline =
    sub.status === "trial" ? (days !== null && days > 0 ? `Te quedan ${days} días de prueba gratis` : "Tu prueba gratis terminó hoy")
    : sub.status === "active" ? `Plan ${sub.plan?.name ?? ""} activo`
    : sub.status === "past_due" ? "Tu plan está vencido"
    : "Suscripción cancelada";

  return (
    <main className="plan-main dash-page">
        <section className="adm-card plan-hero">
          <span className={`sub-badge sub-${sub.status}`}>{STATUS_LABEL[sub.status]}</span>
          <h1>{headline}</h1>
          <p className="adm-muted">
            {sub.status === "trial" && `Tu prueba termina el ${formatShortDate(sub.trialEndsAt)}. Tu página sigue funcionando mientras regularizas.`}
            {sub.status === "active" && `Pagado hasta el ${formatShortDate(sub.paidUntil)}${days !== null ? ` (${days} días)` : ""}.`}
            {sub.status === "past_due" && "Tu página de reservas sigue activa. Escríbenos para regularizar y evitar interrupciones."}
            {sub.status === "cancelled" && "Escríbenos si quieres reactivar tu suscripción."}
          </p>

          <dl className="plan-facts">
            <div><dt>Plan</dt><dd>{sub.plan ? `${sub.plan.name} · ${formatPrice(sub.plan.priceClp)}/mes` : "Aún no eliges plan"}</dd></div>
            <div>
              <dt>Profesionales</dt>
              <dd className={overLimit ? "adm-warn" : undefined}>
                {sub.staffCount}{sub.plan?.maxStaff != null ? ` de ${sub.plan.maxStaff}` : ""}
                {overLimit && " · supera tu plan"}
              </dd>
            </div>
            <div><dt>Negocio</dt><dd>{business.name}</dd></div>
          </dl>

          {!BILLING_CONTACT_WHATSAPP && !BILLING_CONTACT_EMAIL && sub.status !== "active" && (
            <p className="adm-note">Para pagar o cambiar de plan, comunícate con el equipo de AuraBook.</p>
          )}
          {(BILLING_CONTACT_WHATSAPP || BILLING_CONTACT_EMAIL) && (
            <div className="plan-contact">
              {BILLING_CONTACT_WHATSAPP && (
                <a className="btn-primary" target="_blank" rel="noreferrer"
                  href={`https://wa.me/${BILLING_CONTACT_WHATSAPP}?text=${encodeURIComponent(message)}`}>
                  <MessageSquare size={16} /> Pagar o cambiar plan por WhatsApp
                </a>
              )}
              {BILLING_CONTACT_EMAIL && (
                <a className="btn-secondary"
                  href={`mailto:${BILLING_CONTACT_EMAIL}?subject=${encodeURIComponent(`Plan AuraBook · ${business.name}`)}&body=${encodeURIComponent(message)}`}>
                  <Mail size={16} /> Escribir por correo
                </a>
              )}
            </div>
          )}
        </section>

        {sub.availablePlans.length > 0 && (
          <section className="adm-stack">
            <h2 className="plan-section-title">Planes disponibles</h2>
            <div className="adm-plans">
              {sub.availablePlans.map((p) => {
                const current = p.id === sub.plan?.id;
                const fits = p.maxStaff === null || sub.staffCount <= p.maxStaff;
                return (
                  <article key={p.id} className={`adm-plan${current ? " current" : ""}`}>
                    <div className="adm-plan-head">
                      <strong>{p.name}</strong>
                      {current && <span className="sub-badge sub-active">Tu plan</span>}
                    </div>
                    <span className="adm-plan-price">{formatPrice(p.priceClp)}<small>/mes</small></span>
                    {p.description && <p>{p.description}</p>}
                    <ul>
                      <li><Check size={13} /> {p.maxStaff === null ? "Profesionales ilimitados" : `Hasta ${p.maxStaff} ${p.maxStaff === 1 ? "profesional" : "profesionales"}`}</li>
                      <li><Check size={13} /> Página de reservas y panel</li>
                    </ul>
                    {!fits && <small className="adm-warn">Tienes {sub.staffCount} profesionales activos.</small>}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="adm-card">
          <div className="adm-card-head"><h2>Historial de pagos</h2></div>
          {sub.payments.length === 0 ? (
            <p className="adm-empty">Aún no registras pagos.</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>Fecha</th><th>Plan</th><th className="num">Monto</th><th>Cubre hasta</th><th>Medio</th></tr></thead>
                <tbody>
                  {sub.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatShortDate(p.paidAt)}</td>
                      <td>{p.planName ?? "—"}{p.months > 1 ? ` × ${p.months} meses` : ""}</td>
                      <td className="num">{formatPrice(p.amountClp)}</td>
                      <td>{formatShortDate(p.periodEnd)}</td>
                      <td>{METHOD_LABEL[p.method]}</td>
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
