import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileCheck, HeartHandshake, MessageCircle, Sparkles } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { COMPANY, whatsappUrl } from "@/lib/company";
import { breadcrumbLd, graph, organizationLd } from "@/lib/seo";
import fotoFundador from "@/public/photos/fundador-christofer-godoy.jpg";

export const dynamic = "force-static";

const DESCRIPTION =
  "Somos un equipo chileno que construye herramientas simples para negocios que atienden con hora. Conoce a las personas detrás de AuraBook.";

export const metadata: Metadata = {
  title: "Nosotros | AuraBook",
  description: DESCRIPTION,
  alternates: { canonical: "/nosotros" },
  openGraph: { title: "Detrás de AuraBook hay personas, no un call center", description: DESCRIPTION, url: "/nosotros" },
};

const VALUES = [
  { icon: Sparkles, title: "Simple primero", text: "Si tu cliente necesita más de un minuto para reservar, algo hicimos mal." },
  { icon: FileCheck, title: "Sin letra chica", text: "No pedimos tarjeta, no hay renovación automática y, si dejas de pagar, no se borra nada." },
  { icon: HeartHandshake, title: "Cerca de ti", text: "Te respondemos por WhatsApp y, si quieres, te ayudamos a dejar tu página lista." },
];

export default function AboutPage() {
  return (
    <div className="lp">
      <JsonLd data={graph(
        organizationLd,
        breadcrumbLd([{ name: "AuraBook", path: "/" }, { name: "Nosotros", path: "/nosotros" }]),
      )} />
      <SiteHeader />
      <main className="pr-main">
        <header className="pr-head">
          <p className="lp-eyebrow">Nosotros</p>
          <h1>Detrás de AuraBook hay personas, no un call center</h1>
          <p>Somos un equipo chileno que construye herramientas simples para negocios que atienden con hora.</p>
        </header>

        <section className="ab-founder" aria-labelledby="ab-founder-title">
          <figure className="ab-photo">
            <Image src={fotoFundador} alt={`${COMPANY.founder}, fundador de AuraBook`} placeholder="blur"
              sizes="(max-width: 720px) 160px, 280px" />
          </figure>
          <div className="ab-story">
            <h2 id="ab-founder-title" className="sr-only">Cómo nació AuraBook</h2>
            <p>
              Hola, soy {COMPANY.founder}, fundador de AuraBook. La idea nació conversando con mi barbero: usaba un sistema
              de reservas extranjero, la versión gratis se le quedaba corta y la de pago era demasiado cara para su barbería.
              Después lo vi una y otra vez en otros negocios: mensajes a las 11 de la noche, horas duplicadas, clientes que no
              llegaban y nadie avisaba.
            </p>
            <p>
              Las herramientas que existían eran caras, en dólares o pensadas para empresas grandes. Por eso creamos AuraBook:
              una página de reservas que cualquier negocio puede tener lista en minutos, a un precio en pesos y con un plan
              gratis de verdad.
            </p>
            <p>
              AuraBook es un producto de {COMPANY.legalName}, empresa chilena. Lo construimos, lo mantenemos y lo atendemos
              nosotros mismos. Si nos escribes, te responde una persona del equipo.
            </p>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-heading">
            <p className="lp-eyebrow">En qué creemos</p>
            <h2>Lo que no transamos.</h2>
          </div>
          <div className="lp-features ab-values">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="lp-feature">
                <Icon size={20} strokeWidth={1.8} />
                <div><h3>{title}</h3><p>{text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" id="contacto" aria-labelledby="ab-contact-title">
          <div className="lp-heading">
            <p className="lp-eyebrow">Contacto</p>
            <h2 id="ab-contact-title">Datos de la empresa.</h2>
          </div>
          <dl className="ab-company">
            <div><dt>Razón social</dt><dd>{COMPANY.legalName}</dd></div>
            <div><dt>RUT</dt><dd>{COMPANY.rut}</dd></div>
            <div><dt>Ciudad</dt><dd>{COMPANY.city}</dd></div>
            <div><dt>Email</dt><dd><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></dd></div>
            <div>
              <dt>WhatsApp</dt>
              <dd><a href={whatsappUrl()} target="_blank" rel="noopener">{COMPANY.whatsappDisplay}</a> · respondemos {COMPANY.hours}</dd>
            </div>
          </dl>
          <div className="lp-actions ab-actions">
            <a href={whatsappUrl()} target="_blank" rel="noopener" className="btn-primary lp-btn">
              <MessageCircle size={17} /> Escríbenos por WhatsApp
            </a>
            <Link href="/registro" className="btn-secondary lp-btn">Crear mi página gratis <ArrowRight size={17} /></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
