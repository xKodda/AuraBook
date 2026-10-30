import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Clock } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { formatDuration } from "@/lib/dates";
import { SERVICE_PRESETS } from "@/lib/presets";
import { RUBRO_PAGES, rubroBySlug } from "@/lib/rubros";
import { breadcrumbLd, faqLd, graph, organizationLd } from "@/lib/seo";

// Páginas estáticas: se generan al compilar, una por rubro.
export const dynamicParams = false;
export const generateStaticParams = () => RUBRO_PAGES.map((r) => ({ rubro: r.slug }));

type Props = { params: Promise<{ rubro: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const rubro = rubroBySlug((await params).rubro);
  if (!rubro) return {};
  const path = `/para/${rubro.slug}`;
  return {
    title: `${rubro.title} | AuraBook`,
    description: rubro.description,
    alternates: { canonical: path },
    openGraph: { title: rubro.title, description: rubro.description, url: path },
  };
}

// Mismas preguntas en todas las páginas de rubro, después de las propias.
const COMMON_FAQ = [
  { q: "¿Necesito tarjeta para probar?", a: "No. Creas tu cuenta y tu página de reservas gratis, sin datos de pago." },
  { q: "¿Mis clientes tienen que crear una cuenta?", a: "No. Eligen servicio, profesional y hora, y dejan su nombre y teléfono." },
];

export default async function RubroPage({ params }: Props) {
  const rubro = rubroBySlug((await params).rubro);
  if (!rubro) notFound();
  const faq = [...rubro.faq, ...COMMON_FAQ];
  const examples = SERVICE_PRESETS[rubro.category].slice(0, 5);
  const others = RUBRO_PAGES.filter((r) => r.slug !== rubro.slug);

  return (
    <div className="lp">
      <JsonLd data={graph(
        organizationLd,
        faqLd(faq),
        breadcrumbLd([{ name: "AuraBook", path: "/" }, { name: rubro.name, path: `/para/${rubro.slug}` }]),
      )} />
      <SiteHeader />
      <main className="pr-main">
        <header className="pr-head">
          <p className="lp-eyebrow">{rubro.name}</p>
          <h1>{rubro.h1}</h1>
          <p>{rubro.lead}</p>
          <div className="lp-actions rb-actions">
            <Link href="/registro" className="btn-primary lp-btn">Crear mi página gratis <ArrowRight size={17} /></Link>
            <Link href="/demo" className="lp-link">Probar la demo</Link>
          </div>
        </header>

        <section className="lp-section">
          <div className="lp-heading">
            <p className="lp-eyebrow">Por qué AuraBook</p>
            <h2>Pensado para cómo trabajas.</h2>
          </div>
          <div className="lp-features">
            {rubro.points.map((p) => (
              <div key={p.title} className="lp-feature">
                <Check size={20} strokeWidth={1.8} />
                <div><h3>{p.title}</h3><p>{p.text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-heading">
            <p className="lp-eyebrow">Listo para empezar</p>
            <h2>Servicios sugeridos al crear tu negocio.</h2>
          </div>
          <ul className="lp-checks rb-services">
            {examples.map((s) => (
              <li key={s.name}><Clock size={17} /> {s.name} · {formatDuration(s.durationMin)}</li>
            ))}
          </ul>
          <p className="rb-note">Puedes cambiarlos, borrarlos o agregar los tuyos, cada uno con su precio y duración.</p>
        </section>

        <section className="lp-section lp-faq pr-faq" aria-labelledby="rb-faq-title">
          <div className="lp-heading">
            <p className="lp-eyebrow">Preguntas frecuentes</p>
            <h2 id="rb-faq-title">Lo que suelen preguntarnos.</h2>
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

        <nav className="lp-rubros rb-others" aria-label="Otros rubros">
          <span>También para</span>
          {others.map((r) => <Link key={r.slug} href={`/para/${r.slug}`}>{r.name}</Link>)}
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
