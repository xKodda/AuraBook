import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { whatsappUrl } from "@/lib/company";
import { formatPrice } from "@/lib/dates";
import { FOUNDERS, FOUNDERS_MESSAGE, foundersLeft } from "@/lib/founders";
import { breadcrumbLd, graph, organizationLd } from "@/lib/seo";

export const dynamic = "force-static";

const DESCRIPTION =
  `Los primeros ${FOUNDERS.total} negocios en AuraBook tienen Premium gratis por ${FOUNDERS.freeMonths} meses, ayuda para dejar su página lista y precio congelado.`;

export const metadata: Metadata = {
  title: "Programa Fundadores | AuraBook",
  description: DESCRIPTION,
  alternates: { canonical: "/fundadores" },
  openGraph: { title: `Sé uno de los primeros ${FOUNDERS.total} negocios en AuraBook`, description: DESCRIPTION, url: "/fundadores" },
};

const GIVE = [
  `${FOUNDERS.freeMonths} meses de Premium gratis, sin tarjeta.`,
  "Te dejamos tu página lista: la configuramos contigo por videollamada en 15 minutos.",
  "Línea directa por WhatsApp con el fundador.",
  `Precio congelado de ${formatPrice(FOUNDERS.priceClp)} al mes para siempre, aunque Premium suba después.`,
  "Tu negocio aparece como negocio fundador en nuestro sitio (si quieres).",
];

const ASK = [
  "Usar AuraBook en tu negocio real.",
  "Una conversación corta al mes para contarnos qué mejorar.",
  "Si te gusta, un testimonio con tu nombre y foto.",
];

export default function FoundersPage() {
  const open = foundersLeft > 0;
  return (
    <div className="lp">
      <JsonLd data={graph(
        organizationLd,
        breadcrumbLd([{ name: "AuraBook", path: "/" }, { name: "Programa Fundadores", path: "/fundadores" }]),
      )} />
      <SiteHeader />
      <main className="pr-main">
        <header className="pr-head">
          <p className="lp-eyebrow">Programa Fundadores</p>
          <h1>Sé uno de los primeros {FOUNDERS.total} negocios en AuraBook</h1>
          <p>AuraBook es nuevo y queremos construirlo junto a negocios reales. A cambio de tu opinión, te damos Premium gratis.</p>
          <p className={`fd-spots${open ? "" : " full"}`}>
            {open
              ? <><b>{foundersLeft === 1 ? "Queda 1 cupo" : `Quedan ${foundersLeft} cupos`}</b> de {FOUNDERS.total}</>
              : <b>Los {FOUNDERS.total} cupos ya están tomados</b>}
          </p>
        </header>

        <div className="fd-grid">
          <section className="fd-card featured" aria-labelledby="fd-give">
            <h2 id="fd-give">Qué recibes</h2>
            <ul className="lp-checks fd-list">
              {GIVE.map((t) => <li key={t}><Check size={17} /> {t}</li>)}
            </ul>
          </section>
          <section className="fd-card" aria-labelledby="fd-ask">
            <h2 id="fd-ask">Qué te pedimos</h2>
            <ul className="lp-checks fd-list">
              {ASK.map((t) => <li key={t}><Check size={17} /> {t}</li>)}
            </ul>
            <p className="fd-after">
              Después de los {FOUNDERS.freeMonths} meses decides tú: sigues en Premium a {formatPrice(FOUNDERS.priceClp)} al mes
              o pasas a Free sin perder nada. Sin tarjeta y sin cobros automáticos.
            </p>
          </section>
        </div>

        <div className="lp-actions fd-actions">
          {open ? (
            <>
              <a href={whatsappUrl(FOUNDERS_MESSAGE)} target="_blank" rel="noopener" className="btn-primary lp-btn">
                <MessageCircle size={17} /> Quiero mi cupo de fundador
              </a>
              <Link href="/registro" className="lp-link">O crea tu página gratis ahora</Link>
            </>
          ) : (
            <Link href="/registro" className="btn-primary lp-btn">Crear mi página gratis <ArrowRight size={17} /></Link>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
