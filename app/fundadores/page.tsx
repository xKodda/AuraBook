import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { BusinessLogo } from "@/components/business-logo";
import { FounderSeal } from "@/components/founder-badge";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { whatsappUrl } from "@/lib/company";
import { formatPrice } from "@/lib/dates";
import { FOUNDER_PRICE_CLP, FOUNDERS_MESSAGE, founderNumberLabel, foundersLeft, foundersSpotsLabel } from "@/lib/founders";
import { getFoundersSummary } from "@/lib/founders-server";
import { breadcrumbLd, graph, organizationLd } from "@/lib/seo";

// Los cupos se cuentan en la base de datos; la página se regenera cada 5 minutos.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { total, months } = await getFoundersSummary();
  const description =
    `Los primeros ${total} negocios en AuraBook tienen Premium gratis por ${months} meses, ayuda para dejar su página lista y precio congelado.`;
  return {
    title: "Programa Fundadores | AuraBook",
    description,
    alternates: { canonical: "/fundadores" },
    openGraph: { title: `Sé uno de los primeros ${total} negocios en AuraBook`, description, url: "/fundadores" },
  };
}

const ASK = [
  "Usar AuraBook en tu negocio real.",
  "Una conversación corta al mes para contarnos qué mejorar.",
  "Si te gusta, un testimonio con tu nombre y foto.",
];

export default async function FoundersPage() {
  const founders = await getFoundersSummary();
  const open = foundersLeft(founders) > 0;
  const give = [
    `${founders.months} meses de Premium gratis desde que publicas tu página, sin tarjeta.`,
    "Te dejamos tu página lista: la configuramos contigo por videollamada en 15 minutos.",
    "Línea directa por WhatsApp con el fundador.",
    `Precio congelado de ${formatPrice(FOUNDER_PRICE_CLP)} al mes para siempre, aunque Premium suba después.`,
    "El sello «Negocio Fundador» en tu panel y en tu página de reservas.",
    "Tu negocio en el muro de fundadores de este sitio (si quieres).",
  ];

  return (
    <div className="lp">
      <JsonLd data={graph(
        organizationLd,
        breadcrumbLd([{ name: "AuraBook", path: "/" }, { name: "Programa Fundadores", path: "/fundadores" }]),
      )} />
      <SiteHeader />
      <main className="pr-main">
        <header className="pr-head fd-head">
          {/* El número que le tocaría a quien se sume ahora. */}
          <FounderSeal number={Math.min(founders.taken + 1, Math.max(founders.total, 1))} size={104} />
          <p className="lp-eyebrow">Programa Fundadores</p>
          <h1>Sé uno de los primeros {founders.total} negocios en AuraBook</h1>
          <p>AuraBook es nuevo y queremos construirlo junto a negocios reales. A cambio de tu opinión, te damos Premium gratis.</p>
          <p className={`fd-spots${open ? "" : " full"}`}>
            {open ? <b>{foundersSpotsLabel(founders)}{founders.live && ` de ${founders.total}`}</b> : <b>Los {founders.total} cupos ya están tomados</b>}
          </p>
          {founders.live && (
            <ol className="fd-meter" aria-label={`${founders.taken} de ${founders.total} cupos tomados`}>
              {Array.from({ length: founders.total }, (_, i) => <li key={i} className={i < founders.taken ? "taken" : undefined} />)}
            </ol>
          )}
        </header>

        <div className="fd-grid">
          <section className="fd-card featured" aria-labelledby="fd-give">
            <h2 id="fd-give">Qué recibes</h2>
            <ul className="lp-checks fd-list">
              {give.map((t) => <li key={t}><Check size={17} /> {t}</li>)}
            </ul>
          </section>
          <section className="fd-card" aria-labelledby="fd-ask">
            <h2 id="fd-ask">Qué te pedimos</h2>
            <ul className="lp-checks fd-list">
              {ASK.map((t) => <li key={t}><Check size={17} /> {t}</li>)}
            </ul>
            <p className="fd-after">
              Después de los {founders.months} meses decides tú: sigues en Premium a {formatPrice(FOUNDER_PRICE_CLP)} al mes
              o pasas a Free sin perder nada. Sin tarjeta y sin cobros automáticos.
            </p>
          </section>
        </div>

        <div className="lp-actions fd-actions">
          {open ? (
            <>
              <Link href="/registro" className="btn-primary lp-btn">Crear mi página y tomar mi cupo <ArrowRight size={17} /></Link>
              <a href={whatsappUrl(FOUNDERS_MESSAGE)} target="_blank" rel="noopener" className="lp-link">
                <MessageCircle size={15} /> ¿Dudas? Escríbenos
              </a>
            </>
          ) : (
            <Link href="/registro" className="btn-primary lp-btn">Crear mi página gratis <ArrowRight size={17} /></Link>
          )}
        </div>
        {open && <p className="fd-how">El cupo se asigna solo al publicar tu página, por orden de llegada.</p>}

        {founders.wall.length > 0 && (
          <section className="lp-section fd-wall" aria-labelledby="fd-wall-title">
            <div className="lp-heading">
              <p className="lp-eyebrow">Muro de fundadores</p>
              <h2 id="fd-wall-title">Los negocios que construyen AuraBook con nosotros.</h2>
            </div>
            <ul>
              {founders.wall.map((f) => (
                <li key={f.number}>
                  <Link href={`/reservar/${f.slug}`}>
                    <BusinessLogo name={f.name} url={f.logoUrl} brandColor={f.brandColor} size={48} />
                    <span><b>{f.name}</b><small>Fundador {founderNumberLabel(f.number)}</small></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
