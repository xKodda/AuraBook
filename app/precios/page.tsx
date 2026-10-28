import type { Metadata } from "next";
import { PricingTable } from "@/components/pricing-table";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getPublicPlans } from "@/lib/billing-server";
import { formatPrice } from "@/lib/dates";
import { launchPromo } from "@/lib/plans";

// Los precios se editan en /admin; la página se regenera cada hora.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Precios | AuraBook",
  description: "Free gratis para siempre y Premium para negocios con equipo. Prueba Premium 30 días sin tarjeta y sin cobro automático.",
  alternates: { canonical: "/precios" },
  openGraph: {
    title: "Precios de AuraBook",
    description: "Free gratis para siempre. Premium para negocios con equipo, con 30 días de prueba sin tarjeta.",
    url: "/precios",
  },
};

export default async function PricingPage() {
  const data = await getPublicPlans();
  const premium = data.plans.find((p) => p.code === "premium");
  const free = data.plans.find((p) => p.code === "free");
  const promo = premium ? launchPromo(premium) : null;
  const faq = [
    ...(promo && premium ? [{
      q: "¿Qué es el precio de lanzamiento?",
      a: `Si te suscribes a Premium con pago mensual durante el lanzamiento, pagas ${formatPrice(promo.priceClp)} al mes los primeros ${promo.months} meses. Después, el precio es ${formatPrice(premium.priceClp)} al mes. Sin renovación automática.`,
    }] : []),
    {
      q: "¿Necesito tarjeta para la prueba?",
      a: `No. Al crear tu cuenta tienes Premium por ${data.trialDays} días, sin ingresar datos de pago.`,
    },
    {
      q: `¿Qué pasa al terminar los ${data.trialDays} días?`,
      a: `Pasas a Free automáticamente y sin cobros. No se borra nada: tus reservas, clientes, profesionales y servicios se mantienen. En Free tu página ofrece hasta ${free?.maxStaff ?? 2} profesionales, usa el diseño de AuraBook y puede recibir ${free?.maxMonthlyBookings ?? 100} reservas nuevas al mes; lo que supere esos límites se recupera al volver a Premium.`,
    },
    {
      q: "¿Cómo pago Premium?",
      a: "Por transferencia bancaria. Escríbenos desde «Mi plan» en tu panel y te enviamos los datos. Puedes pagar mes a mes o un año completo.",
    },
    {
      q: "¿Se renueva solo?",
      a: "No. No guardamos tarjetas ni cobramos de forma automática: pagas solo cuando decides seguir. Si no renuevas, pasas a Free.",
    },
    {
      q: "¿Los precios incluyen impuestos?",
      a: "Sí. Los precios están en pesos chilenos e incluyen IVA.",
    },
    {
      q: "¿Me entregan boleta o factura?",
      a: "Sí. AuraBook es un producto de Clikium SpA: emitimos boleta o factura, como la necesites. Si quieres factura, indícanos los datos de tu empresa al pagar.",
    },
    {
      q: `¿Y si mi equipo tiene más de ${premium?.maxStaff ?? 3} personas?`,
      a: premium?.extraStaffPriceClp && premium.maxStaff !== null
        ? `Premium incluye ${premium.maxStaff} profesionales y puedes sumar más por ${formatPrice(premium.extraStaffPriceClp)} al mes cada uno, hasta ${premium.maxStaff + (premium.maxExtraStaff ?? 0)}. Si necesitas más, escríbenos a contacto@clikium.cl.`
        : "Escríbenos a contacto@clikium.cl y lo vemos según tu negocio.",
    },
  ];

  return (
    <div className="lp">
      <SiteHeader />
      <main className="pr-main">
        <header className="pr-head">
          <p className="lp-eyebrow">Precios</p>
          <h1>Empieza gratis. Paga cuando tu equipo crezca.</h1>
          <p>Free sirve de verdad para empezar, sin plazo. Premium suma a tu equipo, tu marca y te ayuda a reducir las inasistencias.</p>
        </header>
        <PricingTable data={data} />
        <section className="lp-section lp-faq pr-faq" aria-labelledby="pr-faq-title">
          <div className="lp-heading">
            <p className="lp-eyebrow">Facturación</p>
            <h2 id="pr-faq-title">Preguntas sobre planes y pagos.</h2>
          </div>
          <div className="lp-faq-list">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
