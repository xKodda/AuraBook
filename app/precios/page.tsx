import type { Metadata } from "next";
import { PricingTable } from "@/components/pricing-table";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getPublicPlans } from "@/lib/billing-server";

// Los precios se editan en /admin; la página se regenera cada hora.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Precios | AuraBook",
  description: "Free para quien atiende solo y Premium para negocios con equipo. Prueba Premium 30 días sin tarjeta y sin cobro automático.",
  alternates: { canonical: "/precios" },
  openGraph: {
    title: "Precios de AuraBook",
    description: "Free para quien atiende solo. Premium para negocios con equipo, con 30 días de prueba sin tarjeta.",
    url: "/precios",
  },
};

export default async function PricingPage() {
  const data = await getPublicPlans();
  const premium = data.plans.find((p) => p.code === "premium");
  const faq = [
    {
      q: "¿Necesito tarjeta para la prueba?",
      a: `No. Al crear tu cuenta tienes Premium por ${data.trialDays} días, sin ingresar datos de pago.`,
    },
    {
      q: `¿Qué pasa al terminar los ${data.trialDays} días?`,
      a: "Pasas a Free automáticamente y sin cobros. Tus reservas se mantienen. Si tienes más de un profesional, en tu página de reservas aparece solo el primero hasta que te pases a Premium.",
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
      a: "Escríbenos a contacto@clikium.cl y lo vemos según tu negocio.",
    },
  ];

  return (
    <div className="lp">
      <SiteHeader />
      <main className="pr-main">
        <header className="pr-head">
          <p className="lp-eyebrow">Precios</p>
          <h1>Empieza gratis. Paga cuando tu equipo crezca.</h1>
          <p>Free sirve de verdad a quien atiende solo. Premium suma a tu equipo y te ayuda a reducir las inasistencias.</p>
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
