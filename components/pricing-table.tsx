"use client";

// /precios: dos tarjetas con lo más importante de cada plan, selector mensual/anual, comparación completa desplegable
// y calculadora según el tamaño del equipo. Los datos vienen de la base de datos (public_plans) y lib/plans.ts.

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { formatPrice } from "@/lib/dates";
import {
  SOON, comparison, keyFeatures, launchPromo, premiumMonthlyFor, type CompareValue, type PublicPlans,
} from "@/lib/plans";

const TAGLINE: Record<string, string> = {
  free: "Tu agenda lista para recibir clientes.",
  premium: "Más control, automatización y crecimiento.",
};

function Cell({ value }: { value: CompareValue }) {
  if (value === true) return <Check size={17} className="pr-yes" aria-label="Incluido" />;
  if (value === false) return <Minus size={17} className="pr-no" aria-label="No incluido" />;
  if (value === SOON) return <span className="pr-soon">Próximamente</span>;
  return <span>{value}</span>;
}

export function PricingTable({ data }: { data: PublicPlans }) {
  const [yearly, setYearly] = useState(false);
  const [staff, setStaff] = useState(3);
  const free = data.plans.find((p) => p.code === "free");
  const premium = data.plans.find((p) => p.code === "premium");
  const savings = premium?.priceYearlyClp ? premium.priceClp * 12 - premium.priceYearlyClp : 0;
  const maxStaff = premium ? (premium.maxStaff ?? 8) + (premium.maxExtraStaff ?? 0) : 8;
  const monthlyForTeam = premium ? premiumMonthlyFor(premium, staff) : null;
  const freeFits = free?.maxStaff == null || staff <= free.maxStaff;

  return (
    <>
      <div className="pr-toggle" role="radiogroup" aria-label="Forma de pago">
        <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? "active" : undefined} onClick={() => setYearly(false)}>
          Mensual
        </button>
        <button type="button" role="radio" aria-checked={yearly} className={yearly ? "active" : undefined} onClick={() => setYearly(true)}>
          Anual {savings > 0 && <span>ahorras {formatPrice(savings)}</span>}
        </button>
      </div>

      <div className="pr-plans">
        {data.plans.map((p) => {
          const isPremium = p.code === "premium";
          // El precio de lanzamiento aplica al pago mensual; el anual ya tiene su propio descuento.
          const promo = yearly ? null : launchPromo(p);
          const price = yearly && p.priceYearlyClp !== null ? p.priceYearlyClp : promo?.priceClp ?? p.priceClp;
          return (
            <article key={p.code} className={`pr-plan${isPremium ? " featured" : ""}`}>
              <div className="pr-plan-head">
                <h2>{p.name}</h2>
                {isPremium && <span className="pr-tag">Recomendado</span>}
              </div>
              <p className="pr-desc">{TAGLINE[p.code] ?? p.description}</p>
              <p className="pr-price">
                {promo && <s aria-label={`Antes ${formatPrice(p.priceClp)}`}>{formatPrice(p.priceClp)}</s>}
                <strong>{price === 0 ? "$0" : formatPrice(price)}</strong>
                <span>{price === 0 ? "gratis para siempre" : yearly ? "al año · IVA incluido" : "al mes · IVA incluido"}</span>
              </p>
              <p className="pr-equiv">
                {isPremium && yearly && p.priceYearlyClp
                  ? `Equivale a ${formatPrice(Math.round(p.priceYearlyClp / 12))} al mes`
                  : isPremium ? `${data.trialDays} días gratis, sin tarjeta y sin renovación automática` : "Sin tarjeta, sin plazo"}
              </p>
              <Link href="/registro" className={isPremium ? "btn-primary pr-cta" : "btn-secondary pr-cta"}>
                {isPremium ? `Probar Premium ${data.trialDays} días` : "Empezar gratis"} <ArrowRight size={16} />
              </Link>
              <ul className="pr-list">
                {keyFeatures(p, formatPrice).map((f) => (
                  <li key={f.text} className={f.soon ? "soon" : undefined}>
                    <Check size={16} /> <span>{f.text}{f.soon && <small>Próximamente</small>}</span>
                  </li>
                ))}
              </ul>
              <p className="pr-for">{isPremium ? "Para negocios que quieren crecer" : "Para quienes están comenzando"}</p>
            </article>
          );
        })}
      </div>

      {free && premium && (
        <details className="pr-compare" id="comparar">
          <summary>Ver la comparación completa</summary>
          <div className="pr-compare-scroll">
            <table>
              <thead>
                <tr><th scope="col">Funcionalidad</th><th scope="col">Free</th><th scope="col">Premium</th></tr>
              </thead>
              <tbody>
                {comparison(free, premium, formatPrice).map((section) => (
                  <Fragment key={section.title}>
                    <tr className="pr-section"><th colSpan={3} scope="colgroup">{section.title}</th></tr>
                    {section.rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row">{r.label}{r.hint && <small>{r.hint}</small>}</th>
                        <td><Cell value={r.free} /></td>
                        <td><Cell value={r.premium} /></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pr-compare-note">
            «Próximamente» marca funciones en desarrollo: se incluirán sin costo adicional en el plan indicado cuando estén disponibles.
          </p>
        </details>
      )}

      {premium && (
        <section className="pr-calc" aria-labelledby="pr-calc-title">
          <div>
            <h2 id="pr-calc-title">¿Cuánto pagarías?</h2>
            <p>Mueve el control según cuántas personas atienden en tu negocio.</p>
          </div>
          <label className="pr-calc-input">
            <span>{staff} {staff === 1 ? "profesional" : "profesionales"}</span>
            <input type="range" min={1} max={maxStaff} value={staff} onChange={(e) => setStaff(Number(e.target.value))}
              aria-label="Cantidad de profesionales" />
          </label>
          <div className="pr-calc-result" aria-live="polite">
            {freeFits ? (
              <>
                <strong>$0</strong>
                <span>Te alcanza con Free. Con Premium serían {formatPrice(premium.priceClp)} al mes.</span>
              </>
            ) : monthlyForTeam !== null ? (
              <>
                <strong>{formatPrice(monthlyForTeam)}<small> al mes</small></strong>
                <span>
                  Premium con {premium.maxStaff} incluidos
                  {staff > (premium.maxStaff ?? 0) ? ` + ${staff - (premium.maxStaff ?? 0)} adicional${staff - (premium.maxStaff ?? 0) === 1 ? "" : "es"}` : ""}.
                  IVA incluido.
                </span>
              </>
            ) : (
              <span>Para equipos más grandes, escríbenos a contacto@clikium.cl.</span>
            )}
          </div>
        </section>
      )}
    </>
  );
}
