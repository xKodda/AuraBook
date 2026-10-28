"use client";

// Tabla de /precios con selector mensual/anual. Los planes vienen de la base de datos (public_plans).

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { formatPrice } from "@/lib/dates";
import { FEATURES, INCLUDED_IN_ALL, launchPromo, planLimitLines, type PublicPlans } from "@/lib/plans";

export function PricingTable({ data }: { data: PublicPlans }) {
  const [yearly, setYearly] = useState(false);
  const premium = data.plans.find((p) => p.code === "premium");
  const savings = premium?.priceYearlyClp ? premium.priceClp * 12 - premium.priceYearlyClp : 0;

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
                {promo ? <span className="pr-tag pr-tag-promo">Precio de lanzamiento</span>
                  : isPremium && data.trialDays > 0 && <span className="pr-tag">{data.trialDays} días gratis</span>}
              </div>
              <p className="pr-desc">{p.description}</p>
              <p className="pr-price">
                {promo && <s aria-label={`Antes ${formatPrice(p.priceClp)}`}>{formatPrice(p.priceClp)}</s>}
                <strong>{price === 0 ? "$0" : formatPrice(price)}</strong>
                <span>{price === 0 ? "para siempre" : yearly ? "al año" : "al mes"}</span>
              </p>
              {promo ? (
                <p className="pr-equiv">Los primeros {promo.months} meses · luego {formatPrice(p.priceClp)} al mes</p>
              ) : isPremium && yearly && p.priceYearlyClp ? (
                <p className="pr-equiv">Equivale a {formatPrice(Math.round(p.priceYearlyClp / 12))} al mes</p>
              ) : <p className="pr-equiv">{isPremium ? "Sin renovación automática" : "Sin tarjeta, sin plazo"}</p>}
              <Link href="/registro" className={isPremium ? "btn-primary pr-cta" : "btn-secondary pr-cta"}>
                {isPremium ? `Probar Premium ${data.trialDays} días` : "Empezar gratis"} <ArrowRight size={16} />
              </Link>
              <ul className="pr-list">
                {planLimitLines(p, formatPrice).map((line) => <li key={line}><Check size={16} /> <b>{line}</b></li>)}
                {isPremium
                  ? p.features.map((f) => <li key={f}><Check size={16} /> <span><b>{FEATURES[f].label}</b><small>{FEATURES[f].description}</small></span></li>)
                  : <li><Check size={16} /> Todo lo esencial para recibir reservas, con la marca AuraBook</li>}
              </ul>
            </article>
          );
        })}
      </div>

      <section className="pr-included" aria-labelledby="pr-included-title">
        <h2 id="pr-included-title">Incluido en todos los planes</h2>
        <ul>
          {INCLUDED_IN_ALL.map((item) => <li key={item}><Check size={16} /> {item}</li>)}
        </ul>
      </section>
    </>
  );
}
