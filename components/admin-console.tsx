"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowUpRight, CalendarCheck, CreditCard, ExternalLink, LayoutGrid, LogOut, MessageSquare,
  Pencil, Plus, Receipt, Search, Settings, Store, TrendingUp, Wallet,
} from "lucide-react";
import {
  extendTrialAction, recordPaymentAction, savePlanAction, setBusinessPlanAction, setCancelledAction,
  sendTestEmailAction, updateSettingsAction, type AdminResult,
} from "@/app/admin/actions";
import { AdminPaymentRequests, type AdminPaymentRequest } from "@/components/admin-payment-requests";
import { BrandMark } from "@/components/brand";
import { METHOD_LABEL, STATUS_LABEL, daysUntil, formatShortDate, monthLabel } from "@/lib/billing";
import { dateInTimeZone, formatPrice } from "@/lib/dates";
import { CATEGORY_LABEL } from "@/lib/theme";
import type { AdminBusiness, AdminPlan, AdminSnapshot, PaymentMethod, SubscriptionStatus } from "@/lib/types";

type EmailStatus = {
  configured: boolean; from: string; captcha: "enforced" | "disabled" | "misconfigured";
  push: { configured: boolean; partial: boolean };
};
const CAPTCHA_LABEL: Record<EmailStatus["captcha"], string> = {
  enforced: "Captcha activo en las reservas",
  disabled: "Sin captcha: las reservas solo tienen límites de intentos",
  misconfigured: "Captcha a medias (falta una clave): las reservas online están detenidas",
};
type Props = { data: AdminSnapshot; demo: boolean; email: string; requests: AdminPaymentRequest[]; emailStatus: EmailStatus };
type Tab = "resumen" | "negocios" | "planes" | "pagos" | "ajustes";

const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "resumen", label: "Resumen", icon: LayoutGrid },
  { id: "negocios", label: "Negocios", icon: Store },
  { id: "planes", label: "Planes", icon: CreditCard },
  { id: "pagos", label: "Pagos", icon: Receipt },
  { id: "ajustes", label: "Ajustes", icon: Settings },
];

const STATUSES: SubscriptionStatus[] = ["trial", "active", "past_due", "cancelled"];

/** Negocios que requieren seguimiento: vencidos, pruebas por terminar y renovaciones cercanas. */
function needsAttention(b: AdminBusiness): boolean {
  const days = daysUntil(b.status === "trial" ? b.trialEndsAt : b.paidUntil);
  return b.status === "past_due"
    || (b.status === "trial" && days !== null && days <= 7)
    || (b.status === "active" && days !== null && days <= 5);
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return <span className={`sub-badge sub-${status}`}>{STATUS_LABEL[status]}</span>;
}

function whatsappLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

function dueText(b: AdminBusiness): string {
  if (b.status === "cancelled") return "Cancelada";
  const iso = b.status === "trial" ? b.trialEndsAt : b.paidUntil;
  const days = daysUntil(iso);
  if (days === null) return "—";
  const prefix = b.status === "trial" ? "Prueba" : "Pagado";
  if (days < 0) return `${prefix} venció hace ${-days} d`;
  return `${prefix} hasta ${formatShortDate(iso)} (${days} d)`;
}

// ─────────────────────────────────────────────────────────────
export function AdminConsole({ data, demo, email, requests, emailStatus }: Props) {
  const [tab, setTab] = useState<Tab>("resumen");
  const [focusId, setFocusId] = useState<string | null>(null);

  function manage(businessId: string) {
    setFocusId(businessId);
    setTab("negocios");
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="panel-shell">
      {demo && (
        <div className="demo-ribbon" role="status">
          <span className="demo-dot" />
          <span>MODO DEMO · Datos y precios de ejemplo. Los cambios no se guardan.</span>
        </div>
      )}
      <header className="panel-header">
        <div className="panel-nav-left">
          <BrandMark href="/admin" suffix="PLATAFORMA" />
        </div>
        <div className="panel-user-menu">
          <Link href="/dashboard" className="header-action-btn">Mi panel</Link>
          {email && <span className="panel-user-email adm-hide-sm">{email}</span>}
          {!demo && (
            <form action="/auth/logout" method="POST">
              <button type="submit" className="panel-logout-btn" aria-label="Cerrar sesión"><LogOut size={14} /></button>
            </form>
          )}
        </div>
      </header>

      <main className="panel-main">
        <nav className="adm-tabs" aria-label="Secciones">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`adm-tab${tab === id ? " active" : ""}`}
              aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>

        {/* Transferencias por revisar: siempre visibles arriba; el historial completo, en «Pagos». */}
        {tab !== "pagos" && <AdminPaymentRequests requests={requests} onlyPending />}
        {tab === "pagos" && <AdminPaymentRequests requests={requests} />}
        {tab === "resumen" && <Overview data={data} onManage={manage} />}
        {tab === "negocios" && <Businesses data={data} focusId={focusId} onFocus={setFocusId} />}
        {tab === "planes" && <Plans plans={data.plans} />}
        {tab === "pagos" && <Payments data={data} />}
        {tab === "ajustes" && <SettingsPanel trialDays={data.settings.trialDays} />}
        {tab === "ajustes" && <EmailPanel status={emailStatus} email={email} />}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────
function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="adm-stat">
      <span className="adm-stat-label">{icon}{label}</span>
      <strong className="adm-stat-value">{value}</strong>
      {sub && <span className="adm-stat-sub">{sub}</span>}
    </div>
  );
}

function Overview({ data, onManage }: { data: AdminSnapshot; onManage: (id: string) => void }) {
  const o = data.overview;
  const delta = o.collectedThisMonthClp - o.collectedLastMonthClp;
  const attention = data.businesses.filter(needsAttention).sort((a, b) => {
    const da = daysUntil(a.status === "trial" ? a.trialEndsAt : a.paidUntil) ?? 0;
    const db = daysUntil(b.status === "trial" ? b.trialEndsAt : b.paidUntil) ?? 0;
    return da - db;
  });
  const potential = data.businesses
    .filter((b) => b.status === "trial" || b.status === "past_due")
    .reduce((s, b) => s + (b.planPriceClp ?? 0), 0);

  return (
    <div className="adm-stack">
      <section className="adm-stats" aria-label="Indicadores principales">
        <Stat icon={<TrendingUp size={14} />} label="Ingreso mensual recurrente" value={formatPrice(o.mrrClp)}
          sub={`${o.byStatus.active} ${o.byStatus.active === 1 ? "suscripción activa" : "suscripciones activas"}`} />
        <Stat icon={<Wallet size={14} />} label="Cobrado este mes" value={formatPrice(o.collectedThisMonthClp)}
          sub={o.collectedLastMonthClp || o.collectedThisMonthClp
            ? `${delta >= 0 ? "+" : "−"}${formatPrice(Math.abs(delta))} vs mes anterior`
            : "Sin pagos aún"} />
        <Stat icon={<Store size={14} />} label="Negocios" value={String(o.businessesTotal)}
          sub={`${o.businessesPublished} publicados · ${o.newThisMonth} nuevos este mes`} />
        <Stat icon={<CalendarCheck size={14} />} label="Reservas (30 días)" value={o.bookings30d.toLocaleString("es-CL")}
          sub="En todos los negocios" />
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Suscripciones por estado</h2>
          {potential > 0 && <span className="adm-muted">Potencial por convertir: {formatPrice(potential)}/mes</span>}
        </div>
        <div className="adm-status-grid">
          {STATUSES.map((s) => (
            <div key={s} className="adm-status-cell">
              <StatusBadge status={s} />
              <strong>{o.byStatus[s]}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="adm-two-col">
        <section className="adm-card">
          <div className="adm-card-head"><h2>Cobrado por mes</h2><span className="adm-muted">Últimos 6 meses</span></div>
          <RevenueChart data={o.revenueByMonth} />
        </section>

        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Requieren atención</h2>
            <span className="adm-muted">{attention.length}</span>
          </div>
          {attention.length === 0 ? (
            <p className="adm-empty">Todo al día. No hay vencimientos próximos.</p>
          ) : (
            <ul className="adm-attention">
              {attention.slice(0, 8).map((b) => {
                const wa = whatsappLink(b.phone, `Hola ${b.name}, te escribimos de AuraBook por tu suscripción.`);
                return (
                  <li key={b.id}>
                    <span className="adm-attention-body">
                      <strong>{b.name}</strong>
                      <small>{dueText(b)}</small>
                    </span>
                    <StatusBadge status={b.status} />
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="panel-action-btn adm-icon-btn"
                        aria-label={`WhatsApp a ${b.name}`}><MessageSquare size={14} /></a>
                    )}
                    <button type="button" className="panel-action-btn" onClick={() => onManage(b.id)}>Gestionar</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Barras de una sola serie. Valor exacto en tooltip (hover/foco) y en la tabla. */
function RevenueChart({ data }: { data: { month: string; amountClp: number }[] }) {
  const max = Math.max(...data.map((d) => d.amountClp), 1);
  const peak = data.reduce((best, d, i) => (d.amountClp > data[best].amountClp ? i : best), 0);
  const last = data.length - 1;
  return (
    <div>
      <div className="rev-chart" role="img" aria-label="Monto cobrado por mes en los últimos 6 meses">
        {data.map((d, i) => {
          const pct = (d.amountClp / max) * 100;
          const label = `${monthLabel(d.month)} ${d.month.slice(0, 4)}${i === last ? " (en curso)" : ""}: ${formatPrice(d.amountClp)}`;
          return (
            <div key={d.month} className="rev-col">
              <div className="rev-track" tabIndex={0} aria-label={label}>
                {(i === peak || i === last) && d.amountClp > 0 && (
                  <span className="rev-value" style={{ bottom: `calc(${pct}% + 6px)` }}>
                    {formatPrice(d.amountClp)}
                  </span>
                )}
                <span className={`rev-bar${i === last ? " current" : ""}`} style={{ height: `${Math.max(pct, d.amountClp ? 2 : 0)}%` }} />
                <span className="rev-tip" role="tooltip">{label}</span>
              </div>
              <span className="rev-month">{monthLabel(d.month)}</span>
            </div>
          );
        })}
      </div>
      <details className="adm-details">
        <summary>Ver como tabla</summary>
        <table className="adm-table">
          <thead><tr><th>Mes</th><th className="num">Cobrado</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}><td>{monthLabel(d.month)} {d.month.slice(0, 4)}</td><td className="num">{formatPrice(d.amountClp)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Negocios
// ─────────────────────────────────────────────────────────────
type Panel = "pago" | "plan" | "prueba" | "cancelar";

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: () => Promise<AdminResult>, onOk?: () => void) {
    setError(null);
    start(async () => {
      try {
        const r = await action();
        if (r.ok) onOk?.();
        else setError(r.error);
      } catch {
        setError("Se perdió la conexión. Intenta nuevamente.");
      }
    });
  }
  return { pending, error, run };
}

function Businesses({ data, focusId, onFocus }: {
  data: AdminSnapshot; focusId: string | null; onFocus: (id: string | null) => void;
}) {
  const [filter, setFilter] = useState<SubscriptionStatus | "all" | "attention">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ id: string; panel: Panel } | null>(
    focusId ? { id: focusId, panel: "pago" } : null,
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.businesses.filter((b) => {
      if (focusId && b.id !== focusId) return false;
      if (filter === "attention" && !needsAttention(b)) return false;
      if (filter !== "all" && filter !== "attention" && b.status !== filter) return false;
      return !q || [b.name, b.slug, b.ownerEmail].some((v) => v.toLowerCase().includes(q));
    });
  }, [data.businesses, filter, query, focusId]);

  const counts = (s: SubscriptionStatus) => data.businesses.filter((b) => b.status === s).length;

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <label className="adm-search">
          <Search size={15} />
          <input value={query} onChange={(e) => { setQuery(e.target.value); onFocus(null); }}
            placeholder="Buscar por nombre, enlace o correo" aria-label="Buscar negocios" />
        </label>
        <div className="onb-chips">
          {(["all", "attention", ...STATUSES] as const).map((f) => (
            <button key={f} type="button" className={`onb-chip${filter === f && !focusId ? " selected" : ""}`}
              aria-pressed={filter === f && !focusId} onClick={() => { setFilter(f); onFocus(null); }}>
              {f === "all" ? `Todos (${data.businesses.length})`
                : f === "attention" ? `Atención (${data.businesses.filter(needsAttention).length})`
                : `${STATUS_LABEL[f]} (${counts(f)})`}
            </button>
          ))}
        </div>
      </div>
      {focusId && (
        <button type="button" className="onb-link-btn" onClick={() => onFocus(null)}>Ver todos los negocios</button>
      )}

      {list.length === 0 && <p className="adm-empty">No hay negocios con este filtro.</p>}
      <ul className="adm-biz-list">
        {list.map((b) => (
          <BusinessRow key={b.id} b={b} plans={data.plans}
            panel={open?.id === b.id ? open.panel : null}
            onPanel={(panel) => setOpen(panel ? { id: b.id, panel } : null)} />
        ))}
      </ul>
    </div>
  );
}

function BusinessRow({ b, plans, panel, onPanel }: {
  b: AdminBusiness; plans: AdminPlan[]; panel: Panel | null; onPanel: (p: Panel | null) => void;
}) {
  const overLimit = b.maxStaff !== null && b.staffCount > b.maxStaff;
  const wa = whatsappLink(b.phone, `Hola ${b.name}, te escribimos de AuraBook.`);
  const toggle = (p: Panel) => onPanel(panel === p ? null : p);
  return (
    <li className="adm-biz">
      <div className="adm-biz-head">
        <span className="adm-biz-title">
          <strong>{b.name}</strong>
          <small>
            {CATEGORY_LABEL[b.category]} ·{" "}
            {b.published
              ? <a href={`/reservar/${b.slug}`} target="_blank" rel="noreferrer">/{b.slug} <ExternalLink size={11} /></a>
              : <span>/{b.slug} · sin publicar</span>}
          </small>
        </span>
        <StatusBadge status={b.status} />
      </div>

      <dl className="adm-biz-meta">
        <div><dt>Plan</dt><dd>{b.planName ? `${b.planName} · ${formatPrice(b.planPriceClp ?? 0)}` : "Sin plan"}</dd></div>
        <div><dt>Vigencia</dt><dd>{dueText(b)}</dd></div>
        <div>
          <dt>Profesionales</dt>
          <dd className={overLimit ? "adm-warn" : undefined}>
            {overLimit && <AlertTriangle size={12} />} {b.staffCount}{b.maxStaff !== null ? ` / ${b.maxStaff}` : ""}
            {overLimit && " (sobre el plan)"}
          </dd>
        </div>
        <div><dt>Reservas 30 d</dt><dd>{b.bookings30d}</dd></div>
        <div><dt>Dueño</dt><dd className="adm-break">{b.ownerEmail || "—"}</dd></div>
        <div><dt>Último pago</dt><dd>{formatShortDate(b.lastPaidAt)}</dd></div>
      </dl>
      {b.notes && <p className="adm-note">Nota: {b.notes}</p>}

      <div className="adm-biz-actions">
        <button type="button" className={`panel-action-btn${panel === "pago" ? " btn-complete" : ""}`} onClick={() => toggle("pago")}>
          Registrar pago
        </button>
        <button type="button" className="panel-action-btn" onClick={() => toggle("plan")}>Cambiar plan</button>
        {/* Solo pruebas (vigentes o vencidas sin pagos): con un pago registrado, extender la prueba no cambia nada. */}
        {(b.status === "trial" || (b.status === "past_due" && !b.paidUntil)) && (
          <button type="button" className="panel-action-btn" onClick={() => toggle("prueba")}>Extender prueba</button>
        )}
        <button type="button" className="panel-action-btn" onClick={() => toggle("cancelar")}>
          {b.status === "cancelled" ? "Reactivar" : "Cancelar"}
        </button>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="panel-action-btn adm-icon-btn" aria-label={`WhatsApp a ${b.name}`}>
            <MessageSquare size={14} />
          </a>
        )}
      </div>

      {panel === "pago" && <PaymentForm b={b} plans={plans} onDone={() => onPanel(null)} />}
      {panel === "plan" && <PlanForm b={b} plans={plans} onDone={() => onPanel(null)} />}
      {panel === "prueba" && <TrialForm b={b} onDone={() => onPanel(null)} />}
      {panel === "cancelar" && <CancelForm b={b} onDone={() => onPanel(null)} />}
    </li>
  );
}

function FormShell({ title, error, children, onSubmit, onCancel, pending, submit }: {
  title: string; error: string | null; children: ReactNode; onSubmit: (e: FormEvent) => void;
  onCancel: () => void; pending: boolean; submit: string;
}) {
  return (
    <form className="onb-subform adm-inline-form" onSubmit={onSubmit}>
      <h3>{title}</h3>
      {children}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="onb-subform-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Guardando…" : submit}</button>
      </div>
    </form>
  );
}

function PaymentForm({ b, plans, onDone }: { b: AdminBusiness; plans: AdminPlan[]; onDone: () => void }) {
  const choices = plans.filter((p) => p.isActive || p.id === b.planId);
  const [planId, setPlanId] = useState(b.planId ?? choices[0]?.id ?? "");
  const [months, setMonths] = useState(1);
  const plan = plans.find((p) => p.id === planId);
  const [amount, setAmount] = useState(String((plan?.priceClp ?? 0) * 1));
  const [amountTouched, setAmountTouched] = useState(false);
  const [paidAt, setPaidAt] = useState(() => dateInTimeZone(new Date()));
  const [method, setMethod] = useState<PaymentMethod>("transferencia");
  const [reference, setReference] = useState("");
  const { pending, error, run } = useAction();

  const suggested = (plan?.priceClp ?? 0) * months;
  const shownAmount = amountTouched ? amount : String(suggested);

  if (choices.length === 0) {
    return <p className="adm-note">Primero crea un plan en la pestaña «Planes».</p>;
  }

  return (
    <FormShell title={`Registrar pago · ${b.name}`} error={error} pending={pending} submit="Registrar pago" onCancel={onDone}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => recordPaymentAction({
          businessId: b.id, planId, amountClp: Number(shownAmount.replace(/\D/g, "")), months, paidAt, method, reference,
        }), onDone);
      }}>
      <div className="onb-grid-2">
        <label className="onb-field">
          <span className="field-label">Plan</span>
          <select className="text-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {choices.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatPrice(p.priceClp)}/mes</option>)}
          </select>
        </label>
        <label className="onb-field">
          <span className="field-label">Meses pagados</span>
          <select className="text-input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {m === 1 ? "mes" : "meses"}</option>)}
          </select>
        </label>
        <label className="onb-field">
          <span className="field-label">Monto recibido (CLP)</span>
          <input className="text-input" inputMode="numeric" value={shownAmount} required
            onChange={(e) => { setAmountTouched(true); setAmount(e.target.value.replace(/[^\d]/g, "")); }} />
          <small className="field-hint">
            {formatPrice(Number(shownAmount || 0))}{amountTouched && Number(shownAmount) !== suggested ? ` · sugerido ${formatPrice(suggested)}` : ""}
          </small>
        </label>
        <label className="onb-field">
          <span className="field-label">Fecha de pago</span>
          <input className="text-input" type="date" value={paidAt} max={dateInTimeZone(new Date())}
            onChange={(e) => setPaidAt(e.target.value)} required />
        </label>
        <label className="onb-field">
          <span className="field-label">Medio</span>
          <select className="text-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </label>
        <label className="onb-field">
          <span className="field-label">Referencia <em className="onb-optional">opcional</em></span>
          <input className="text-input" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)}
            placeholder="N° de transferencia" />
        </label>
      </div>
      <small className="field-hint">
        El periodo pagado se suma al final de la prueba o del periodo vigente, sin perder días.
      </small>
    </FormShell>
  );
}

function PlanForm({ b, plans, onDone }: { b: AdminBusiness; plans: AdminPlan[]; onDone: () => void }) {
  const [planId, setPlanId] = useState(b.planId ?? "");
  const { pending, error, run } = useAction();
  return (
    <FormShell title="Cambiar plan" error={error} pending={pending} submit="Guardar" onCancel={onDone}
      onSubmit={(e) => { e.preventDefault(); run(() => setBusinessPlanAction(b.id, planId || null), onDone); }}>
      <label className="onb-field">
        <span className="field-label">Plan asignado</span>
        <select className="text-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Sin plan</option>
          {plans.filter((p) => p.isActive || p.id === b.planId).map((p) => (
            <option key={p.id} value={p.id}>{p.name} · {formatPrice(p.priceClp)}/mes</option>
          ))}
        </select>
        <small className="field-hint">No registra un pago ni cambia la vigencia.</small>
      </label>
    </FormShell>
  );
}

function TrialForm({ b, onDone }: { b: AdminBusiness; onDone: () => void }) {
  const [days, setDays] = useState(7);
  const { pending, error, run } = useAction();
  return (
    <FormShell title="Extender prueba gratis" error={error} pending={pending} submit="Extender" onCancel={onDone}
      onSubmit={(e) => { e.preventDefault(); run(() => extendTrialAction(b.id, days), onDone); }}>
      <label className="onb-field">
        <span className="field-label">Días adicionales</span>
        <input className="text-input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        <small className="field-hint">Se suman desde hoy o desde el fin de la prueba actual, lo que sea posterior.</small>
      </label>
    </FormShell>
  );
}

function CancelForm({ b, onDone }: { b: AdminBusiness; onDone: () => void }) {
  const cancelling = b.status !== "cancelled";
  const [notes, setNotes] = useState("");
  const { pending, error, run } = useAction();
  return (
    <FormShell title={cancelling ? "Cancelar suscripción" : "Reactivar suscripción"} error={error} pending={pending}
      submit={cancelling ? "Confirmar cancelación" : "Reactivar"} onCancel={onDone}
      onSubmit={(e) => { e.preventDefault(); run(() => setCancelledAction(b.id, cancelling, notes), onDone); }}>
      <label className="onb-field">
        <span className="field-label">Motivo / nota <em className="onb-optional">opcional</em></span>
        <input className="text-input" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
        <small className="field-hint">
          {cancelling ? "Solo marca la suscripción como cancelada; la página del negocio sigue activa." : "Vuelve a su estado según fechas de prueba y pago."}
        </small>
      </label>
    </FormShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Planes
// ─────────────────────────────────────────────────────────────
function Plans({ plans }: { plans: AdminPlan[] }) {
  const [editing, setEditing] = useState<AdminPlan | "new" | null>(plans.length === 0 ? "new" : null);
  return (
    <div className="adm-stack">
      <div className="adm-card-head">
        <h2>Planes</h2>
        <button type="button" className="btn-secondary" onClick={() => setEditing("new")}><Plus size={16} /> Nuevo plan</button>
      </div>
      {editing === "new" && <PlanEditor plan={null} onDone={() => setEditing(null)} />}
      {plans.length === 0 && editing !== "new" && <p className="adm-empty">Aún no hay planes.</p>}
      <div className="adm-plans">
        {plans.map((p) => (
          <article key={p.id} className={`adm-plan${p.isActive ? "" : " inactive"}`}>
            <div className="adm-plan-head">
              <strong>{p.name}</strong>
              {!p.isActive && <span className="sub-badge sub-cancelled">Archivado</span>}
            </div>
            <span className="adm-plan-price">{formatPrice(p.priceClp)}<small>/mes</small></span>
            <p>{p.description || "Sin descripción"}</p>
            <ul>
              <li>{p.maxStaff === null ? "Profesionales ilimitados" : `Hasta ${p.maxStaff} ${p.maxStaff === 1 ? "profesional" : "profesionales"}`}</li>
              <li>{p.subscribers} {p.subscribers === 1 ? "negocio" : "negocios"} en este plan</li>
            </ul>
            <button type="button" className="panel-action-btn" onClick={() => setEditing(p)}><Pencil size={13} /> Editar</button>
            {editing !== "new" && editing?.id === p.id && <PlanEditor plan={p} onDone={() => setEditing(null)} />}
          </article>
        ))}
      </div>
    </div>
  );
}

function PlanEditor({ plan, onDone }: { plan: AdminPlan | null; onDone: () => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(plan ? String(plan.priceClp) : "");
  const [maxStaff, setMaxStaff] = useState(plan?.maxStaff ? String(plan.maxStaff) : "");
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const { pending, error, run } = useAction();
  return (
    <FormShell title={plan ? `Editar «${plan.name}»` : "Nuevo plan"} error={error} pending={pending} submit="Guardar plan" onCancel={onDone}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => savePlanAction({
          id: plan?.id ?? null, name, description, priceClp: Number(price || "NaN"),
          maxStaff: maxStaff ? Number(maxStaff) : null, isActive,
        }), onDone);
      }}>
      <div className="onb-grid-2">
        <label className="onb-field">
          <span className="field-label">Nombre</span>
          <input className="text-input" value={name} required minLength={2} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="onb-field">
          <span className="field-label">Precio mensual (CLP)</span>
          <input className="text-input" inputMode="numeric" value={price} required
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} />
          <small className="field-hint">{price ? formatPrice(Number(price)) : " "}</small>
        </label>
        <label className="onb-field">
          <span className="field-label">Máximo de profesionales</span>
          <input className="text-input" inputMode="numeric" value={maxStaff} placeholder="Vacío = sin límite"
            onChange={(e) => setMaxStaff(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
        <label className="onb-field">
          <span className="field-label">Descripción <em className="onb-optional">opcional</em></span>
          <input className="text-input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <label className="onb-check">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Disponible para nuevos pagos (desmarca para archivarlo sin afectar a quienes ya lo tienen)</span>
      </label>
    </FormShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Pagos y ajustes
// ─────────────────────────────────────────────────────────────
function Payments({ data }: { data: AdminSnapshot }) {
  const total = data.payments.reduce((s, p) => s + p.amountClp, 0);
  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <h2>Pagos registrados</h2>
        <span className="adm-muted">{data.payments.length} pagos · {formatPrice(total)}</span>
      </div>
      {data.payments.length === 0 ? (
        <p className="adm-empty">Aún no hay pagos. Regístralos desde «Negocios».</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>Fecha</th><th>Negocio</th><th>Plan</th><th className="num">Monto</th><th>Cubre hasta</th><th>Medio</th><th>Ref.</th></tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatShortDate(p.paidAt)}</td>
                  <td>{p.businessName}</td>
                  <td>{p.planName ?? "—"}{p.months > 1 ? ` × ${p.months}` : ""}</td>
                  <td className="num">{formatPrice(p.amountClp)}</td>
                  <td>{formatShortDate(p.periodEnd)}</td>
                  <td>{METHOD_LABEL[p.method]}</td>
                  <td className="adm-muted">{p.reference || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Los avisos de reservas salen por Resend. Si no llegan, el correo de prueba muestra el motivo exacto.
function EmailPanel({ status, email }: { status: EmailStatus; email: string }) {
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useAction();
  return (
    <section className="adm-card adm-narrow">
      <h2>Correos</h2>
      <p className="adm-muted">
        {status.configured ? "Envío configurado" : "Falta RESEND_API_KEY: no se envían avisos de reservas ni recordatorios"}
        {" · "}Remitente: {status.from}
      </p>
      <p className={status.captcha === "misconfigured" ? "form-error" : "adm-muted"}>{CAPTCHA_LABEL[status.captcha]}</p>
      <p className={status.push.partial ? "form-error" : "adm-muted"}>
        {status.push.configured
          ? "Avisos push activos: los dueños pueden activarlos en su agenda o en «Mi cuenta»"
          : status.push.partial
            ? "Avisos push a medias: falta NEXT_PUBLIC_VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY"
            : "Sin avisos push (faltan las claves VAPID): los dueños reciben solo correos"}
      </p>
      {error && <div className="form-error">{error}</div>}
      {sent && <p className="onb-ok onb-saved">✓ Enviado a {email || "tu correo"}. Revisa también la carpeta de spam.</p>}
      <button type="button" className="btn-secondary" disabled={pending}
        onClick={() => { setSent(false); run(() => sendTestEmailAction(), () => setSent(true)); }}>
        {pending ? "Enviando…" : "Enviar correo de prueba"}
      </button>
    </section>
  );
}

function SettingsPanel({ trialDays }: { trialDays: number }) {
  const [days, setDays] = useState(trialDays);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  return (
    <section className="adm-card adm-narrow">
      <h2>Ajustes de la plataforma</h2>
      <form className="auth-form" onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(() => updateSettingsAction(days), () => setSaved(true));
      }}>
        <label className="onb-field">
          <span className="field-label">Días de prueba gratis para negocios nuevos</span>
          <input className="text-input" type="number" min={0} max={365} value={days}
            onChange={(e) => { setDays(Number(e.target.value)); setSaved(false); }} />
          <small className="field-hint">Aplica a los negocios que se creen desde ahora; no cambia pruebas en curso.</small>
        </label>
        {error && <div className="form-error">{error}</div>}
        {saved && <p className="onb-ok onb-saved">✓ Guardado.</p>}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"} <ArrowUpRight size={15} />
        </button>
      </form>
    </section>
  );
}
