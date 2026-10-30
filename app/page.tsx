import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import {
  ArrowRight, BellRing, Brush, CalendarCheck, CalendarX2, Camera, Check, Clock, Dumbbell, GraduationCap, Mail, Palette,
  PawPrint, Scale, ShieldCheck, Smartphone, Stethoscope, UserPlus, Users, Wrench,
} from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { LandingIntro } from "@/components/landing-intro";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getPublicPlans } from "@/lib/billing-server";
import { formatPrice } from "@/lib/dates";
import { faqLd, graph, organizationLd, softwareLd, websiteLd } from "@/lib/seo";
import {
  FinalHalo, HeroPhone, HorizontalGallery, LandingMotion, PopIn, Reveal, RevealImage, RevealItem, ScrollZoom,
} from "@/components/landing-motion";
import fotoTijeras from "@/public/photos/barberia-tijeras.jpg";
import fotoBarberia from "@/public/photos/barberia-herramientas.jpg";
import fotoUnas from "@/public/photos/unas-manicure.jpg";
import fotoCliente from "@/public/photos/cliente-reservando.jpg";
import fotoPeluqueria from "@/public/photos/peluqueria-corte.jpg";
import fotoEstetica from "@/public/photos/estetica-facial.jpg";
import fotoSpa from "@/public/photos/spa-velas.jpg";

const DESCRIPTION =
  "Tu página de reservas con tu marca, lista en minutos. Tus clientes agendan desde el celular, sin descargar apps ni crear cuentas.";

// Los precios vienen de la base de datos (se editan en /admin); la portada se regenera cada hora.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AuraBook · Agenda y reservas online para tu negocio",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: "AuraBook · Reservas online para tu negocio", description: DESCRIPTION, url: "/" },
};

type RubroFoto = { title: string; text: string; src: StaticImageData; alt: string; position?: string };

const RUBRO_FOTOS: RubroFoto[] = [
  { title: "Barberías", text: "Cortes, barba y perfilados, cada barbero con su agenda.", src: fotoBarberia,
    alt: "Máquina de cortar pelo, peinetas y escobilla sobre una toalla gris" },
  { title: "Peluquerías", text: "Corte, color y peinado, cada uno con su duración real.", src: fotoPeluqueria,
    alt: "Estilista peinando el pelo mojado de una clienta antes del corte" },
  { title: "Salones de belleza", text: "Manicure, pestañas y más, sin que se crucen las horas.", src: fotoUnas,
    alt: "Manicurista pintando una uña con un pincel fino" },
  { title: "Estética", text: "Tratamientos con su tiempo exacto y recordatorio para tus clientes.", src: fotoEstetica,
    alt: "Tratamiento facial con un rodillo sobre crema" },
  { title: "Spa", text: "Masajes y sesiones largas, bien repartidas en tu agenda.", src: fotoSpa,
    alt: "Velas encendidas junto a toallas blancas y una flor", position: "40% center" },
];

const RUBROS = [
  "Barberías y salones", "Talleres mecánicos", "Salud y consultas", "Veterinarias", "Abogados y asesorías",
  "Entrenadores", "Clases particulares", "Tatuajes",
];

// Rubros sin foto propia en la galería.
const MAS_RUBROS = [
  { icon: Wrench, href: "/para/talleres-mecanicos", title: "Talleres mecánicos", text: "Mantenciones, diagnósticos y revisiones, sin autos esperando en la puerta." },
  { icon: Stethoscope, href: "/para/consultas-de-salud", title: "Salud y consultas", text: "Kinesiología, psicología, nutrición o dental, cada profesional con su agenda." },
  { icon: PawPrint, href: "/para/veterinarias", title: "Veterinarias y peluquería canina", text: "Consultas, vacunas y baños, con recordatorio para el dueño." },
  { icon: Scale, href: "/para/abogados-y-asesorias", title: "Abogados y asesorías", text: "Primeras reuniones y seguimientos, sin coordinar por correo." },
  { icon: Dumbbell, href: "/para/entrenadores", title: "Entrenadores y estudios", text: "Sesiones personales, evaluaciones y clases de yoga o pilates." },
  { icon: GraduationCap, href: "/para/clases-particulares", title: "Clases y tutorías", text: "Reforzamiento, música o idiomas, cada profesor con sus horas." },
  { icon: Brush, href: "/para/estudios-de-tatuajes", title: "Tatuajes y piercing", text: "Evaluaciones y sesiones largas, bien repartidas en la semana." },
  { icon: Camera, href: "/para/fotografos", title: "Fotografía", text: "Retratos, fotos de producto o carnet, con hora confirmada." },
];

const STEPS = [
  { title: "Crea tu negocio", text: "Nombre, rubro, logo y color. Recibes tu enlace propio al instante." },
  { title: "Agrega equipo y horarios", text: "Quién atiende, qué servicios hace, cuándo trabaja y sus descansos." },
  { title: "Comparte tu enlace", text: "En tu Instagram, WhatsApp o Google Maps. Las reservas llegan solas." },
];

const FEATURES = [
  { icon: Smartphone, title: "Hecho para el celular", text: "Tus clientes reservan en pocos toques, sin apps ni contraseñas." },
  { icon: CalendarCheck, title: "Disponibilidad real", text: "Respeta la duración de cada servicio, los descansos y el horario de cada profesional." },
  { icon: ShieldCheck, title: "Cero horas duplicadas", text: "La base de datos impide que dos personas tomen el mismo horario." },
  { icon: Mail, title: "Aviso de cada reserva", text: "Te llega un correo con los datos del cliente apenas reserva." },
  { icon: BellRing, title: "Recordatorio el día antes", text: "El cliente puede pedir un recordatorio por correo. Menos inasistencias." },
  { icon: CalendarX2, title: "Cancelación autogestionada", text: "Cada cliente cancela desde su enlace, dentro del plazo que tú defines." },
  { icon: Palette, title: "Con tu marca", text: "Tu logo en la página que ven tus clientes; con Premium, también tus colores." },
  { icon: Users, title: "Tu equipo ordenado", text: "Cada profesional con sus servicios y su horario." },
];

const FAQ = [
  { q: "¿Sirve para mi rubro?", a: "Si atiendes con hora, sí: barberías y salones, talleres mecánicos, consultas de salud, veterinarias, abogados, entrenadores, profesores y mucho más. Al crear tu negocio eliges tu rubro y te sugerimos servicios y cargos, que puedes cambiar." },
  { q: "¿Mis clientes tienen que crear una cuenta?", a: "No. Eligen servicio, profesional y hora, y dejan su nombre y teléfono. Reciben un enlace para ver o cancelar su cita." },
  { q: "¿Qué pasa si dos personas intentan reservar la misma hora?", a: "Solo una lo consigue. La disponibilidad se vuelve a verificar al confirmar y la base de datos impide horas solapadas." },
  { q: "¿Necesito instalar algo?", a: "No. Funciona en el navegador del computador y del celular, tanto para ti como para tus clientes." },
  { q: "¿Puedo usar mi logo y mis colores?", a: "Tu logo se ve en tu página en todos los planes. Con Premium (y durante tus 30 días de prueba) también eliges el color de tu marca y puedes ocultar «Reservas con AuraBook»." },
  { q: "¿Mis datos y los de mis clientes están seguros?", a: "Cada negocio está separado del resto a nivel de base de datos, y nadie más que tu equipo ve tus reservas ni los datos de tus clientes." },
];

/** Vista del producto: la página de reservas en un teléfono (marcado estático, sin imágenes). */
function PhonePreview() {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-phone-screen">
        <div className="lp-mini-biz">
          <span className="lp-mini-logo">DJ</span>
          <span><b>Barbería Don José</b><small>Un buen corte empieza aquí.</small></span>
        </div>
        <p className="lp-mini-label"><span>1</span> ¿Qué servicio necesitas?</p>
        <div className="lp-mini-service on"><i /><span><b>Corte de pelo</b><small>45 min</small></span><b>$12.000</b></div>
        <div className="lp-mini-service"><i /><span><b>Corte + barba</b><small>60 min</small></span><b>$16.000</b></div>
        <p className="lp-mini-label"><span>2</span> Elige a tu barbero</p>
        <div className="lp-mini-pills"><span className="on">Cualquiera</span><span>Camila</span><span>Tomás</span></div>
        <p className="lp-mini-label"><span>3</span> Día y hora</p>
        <div className="lp-mini-times">
          {["10:00", "11:00", "12:00", "15:00", "16:00", "17:00"].map((t) => (
            <span key={t} className={t === "11:00" ? "on" : undefined}>{t}</span>
          ))}
        </div>
        <div className="lp-mini-cta">Confirmar 11:00 h</div>
      </div>
    </div>
  );
}

/** Vista grande para el scroll zoom: la página de reservas en un navegador de escritorio. */
function BrowserPreview() {
  return (
    <div className="lp-browser" aria-hidden="true">
      <div className="lp-browser-bar">
        <i /><i /><i />
        <span>aurabook.cl/reservar/taller-don-jose</span>
      </div>
      <div className="lp-browser-page">
        <div className="lp-browser-biz">
          <span className="lp-mini-logo">DJ</span>
          <small>TALLER MECÁNICO</small>
          <b>Taller Don José</b>
          <p>Tu auto en buenas manos.</p>
          <hr />
          <p>Av. Providencia 1234</p>
          <p>+56 9 1234 5678</p>
        </div>
        <div className="lp-browser-main">
          <p className="lp-mini-label"><span>1</span> ¿Qué necesita tu vehículo?</p>
          <div className="lp-mini-service on"><i /><span><b>Cambio de aceite y filtros</b><small>1 h</small></span><b>$45.000</b></div>
          <div className="lp-mini-service"><i /><span><b>Diagnóstico / scanner</b><small>1 h</small></span><b>$25.000</b></div>
          <div className="lp-mini-service"><i /><span><b>Revisión de frenos</b><small>1 h</small></span><b>$20.000</b></div>
          <p className="lp-mini-label"><span>2</span> Día y hora</p>
          <div className="lp-browser-days">
            {["hoy 27", "mié 28", "jue 29", "vie 30", "sáb 31"].map((d, i) => <span key={d} className={i === 1 ? "on" : undefined}>{d}</span>)}
          </div>
          <div className="lp-mini-times lp-browser-times">
            {["09:00", "10:00", "11:00", "12:00", "15:00", "16:00", "17:00", "18:00"].map((t) => (
              <span key={t} className={t === "11:00" ? "on" : undefined}>{t}</span>
            ))}
          </div>
          <div className="lp-mini-cta">Confirmar miércoles 28, 11:00 h</div>
        </div>
      </div>
    </div>
  );
}

/** Vista del panel: agenda del día por profesional. */
function AgendaPreview() {
  const rows = [
    ["10:00", "Diego F.", "Corte de pelo", ""],
    ["11:00", "", "", "Tomás R. · Corte + barba"],
    ["13:00", "Almuerzo", "", "Almuerzo"],
    ["15:00", "Matías S.", "Black mask", "Benjamín L. · Perfilado"],
  ];
  return (
    <div className="lp-agenda" aria-hidden="true">
      <div className="lp-agenda-head"><b>Martes 27</b><span>5 citas</span></div>
      <div className="lp-agenda-grid">
        <span /><b>Camila</b><b>Tomás</b>
        {rows.map(([h, a, s, b], i) => (
          <div key={h} className="lp-agenda-row">
            <small>{h}</small>
            <PopIn index={i * 2} className={a === "Almuerzo" ? "off" : a ? "appt" : ""}>{a && <><b>{a}</b>{s && <small>{s}</small>}</>}</PopIn>
            <PopIn index={i * 2 + 1} className={b === "Almuerzo" ? "off" : b ? "appt" : ""}>{b && <b>{b}</b>}</PopIn>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const plans = await getPublicPlans();
  const free = plans.plans.find((p) => p.code === "free");
  const premium = plans.plans.find((p) => p.code === "premium");
  return (
    <LandingMotion>
    <div className="lp">
      <JsonLd data={graph(organizationLd, websiteLd, softwareLd(plans.plans, DESCRIPTION), faqLd(FAQ))} />
      <LandingIntro />
      <SiteHeader home />

      <main>
        <section className="lp-hero">
          <Reveal onLoad className="lp-hero-text">
            <RevealItem as="p" className="lp-eyebrow">Reservas online · Hecho en Chile</RevealItem>
            <RevealItem as="h1">Tu agenda llena, <span>sin perseguir mensajes.</span></RevealItem>
            <RevealItem as="p" className="lp-lead">
              Una página de reservas con tu marca. Tus clientes eligen servicio, profesional y hora desde el celular;
              tú lo ves todo en un panel simple.
            </RevealItem>
            <RevealItem className="lp-actions">
              <Link href="/registro" className="btn-primary lp-btn">Crear mi página de reservas <ArrowRight size={17} /></Link>
              <Link href="/demo" className="lp-link">Probar la demo</Link>
            </RevealItem>
            <RevealItem>
            <ul className="lp-assurances">
              <li><Check size={15} /> Sin instalar nada</li>
              <li><Check size={15} /> Listo en minutos</li>
              <li><Check size={15} /> Tus clientes no crean cuenta</li>
            </ul>
            </RevealItem>
          </Reveal>
          <HeroPhone toast={<><Mail size={15} /><span><b>Nueva reserva</b><small>Corte de pelo · mañana 11:00</small></span></>}>
            <PhonePreview />
          </HeroPhone>
        </section>

        <div className="lp-rubros" aria-label="Para quién es">
          <span>Pensado para</span>
          {RUBROS.map((r) => <b key={r}>{r}</b>)}
        </div>

        <ScrollZoom background={<Image src={fotoTijeras} alt="" fill sizes="100vw" placeholder="blur" style={{ objectFit: "cover" }} />} heading={<><p className="lp-eyebrow">Tu página de reservas</p><h2>Tu negocio, a un enlace de distancia.</h2></>}>
          <BrowserPreview />
        </ScrollZoom>

        <section className="lp-section" id="como-funciona">
          <SectionHeading eyebrow="Cómo funciona" title="De cero a recibir reservas, en tres pasos." />
          <Reveal as="ol" className="lp-steps">
            {STEPS.map((s, i) => (
              <RevealItem as="li" key={s.title}>
                <span className="lp-step-n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </RevealItem>
            ))}
          </Reveal>
        </section>

        <section className="lp-split lp-split-reverse">
          <RevealImage className="lp-photo lp-photo-wide">
            <Image src={fotoCliente} alt="Persona revisando su celular junto a una taza de café" fill placeholder="blur"
              sizes="(max-width: 960px) 100vw, 55vw" style={{ objectFit: "cover" }} />
          </RevealImage>
          <Reveal className="lp-split-text">
            <RevealItem as="p" className="lp-eyebrow">Para tus clientes</RevealItem>
            <RevealItem as="h2">Reservar contigo, tan fácil como mandar un mensaje.</RevealItem>
            <RevealItem as="p">Eligen servicio, profesional y hora desde cualquier celular. Sin descargar nada, sin crear cuentas y sin esperar a que contestes.</RevealItem>
            <RevealItem>
              <ul className="lp-checks">
                <li><Check size={17} /> Menos de un minuto para reservar</li>
                <li><Mail size={17} /> Confirmación y recordatorio por correo, si lo piden</li>
                <li><CalendarX2 size={17} /> Cancelan desde su enlace, dentro de tu plazo</li>
              </ul>
            </RevealItem>
          </Reveal>
        </section>

        <section className="lp-split">
          <div className="lp-split-text">
            <p className="lp-eyebrow">Para ti</p>
            <h2>Toda tu semana en una sola vista.</h2>
            <p>Ves quién viene, con quién y a qué hora, y ajustas tu equipo, servicios, precios y horarios desde el mismo panel, en el computador o el celular.</p>
            <ul className="lp-checks">
              <li><Clock size={17} /> Horario y descansos por profesional</li>
              <li><UserPlus size={17} /> Cada profesional con sus servicios</li>
              <li><Mail size={17} /> Un correo por cada reserva nueva</li>
            </ul>
          </div>
          <AgendaPreview />
        </section>

        <HorizontalGallery header={<SectionHeading eyebrow="Pensado para tu rubro" title="Para negocios que trabajan con hora." />}>
          {RUBRO_FOTOS.map((r) => (
            <figure key={r.title} className="lp-gallery-card">
              <RevealImage className="lp-photo lp-photo-tall">
                <Image src={r.src} alt={r.alt} fill placeholder="blur" sizes="(max-width: 900px) 78vw, 380px"
                  style={{ objectFit: "cover", objectPosition: r.position ?? "center" }} />
              </RevealImage>
              <figcaption><b>{r.title}</b> {r.text}</figcaption>
            </figure>
          ))}
        </HorizontalGallery>

        <section className="lp-section">
          <SectionHeading eyebrow="Y mucho más" title="Si atiendes con hora, AuraBook es para ti." />
          <Reveal className="lp-features">
            {MAS_RUBROS.map(({ icon: Icon, href, title, text }) => (
              <RevealItem key={title} className="lp-feature">
                <Icon size={20} strokeWidth={1.8} />
                <div><h3><Link href={href} className="lp-feature-link">{title}</Link></h3><p>{text}</p></div>
              </RevealItem>
            ))}
          </Reveal>
        </section>

        <section className="lp-section">
          <SectionHeading eyebrow="Lo esencial, bien hecho" title="Simple para ti. Más simple para tus clientes." />
          <Reveal className="lp-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <RevealItem key={title} className="lp-feature">
                <Icon size={20} strokeWidth={1.8} />
                <div><h3>{title}</h3><p>{text}</p></div>
              </RevealItem>
            ))}
          </Reveal>
        </section>

        {free && premium && (
          <section className="lp-section lp-pricing" id="precios" aria-labelledby="lp-pricing-title">
            <Reveal className="lp-heading">
              <RevealItem as="p" className="lp-eyebrow">Planes y precios</RevealItem>
              <RevealItem as="h2"><span id="lp-pricing-title">Empieza gratis. Crece a tu ritmo.</span></RevealItem>
              <RevealItem as="p" className="lp-pricing-lead">
                Una agenda para comenzar y herramientas para llevar tu negocio más lejos.
              </RevealItem>
            </Reveal>
            <Reveal className="lp-pricing-cards">
              <RevealItem className="lp-pricing-card">
                <span>Free</span>
                <strong>$0</strong>
                <p>Tu agenda lista para recibir clientes.</p>
                <small>{free.maxStaff} profesionales · {free.maxMonthlyBookings} reservas al mes · {free.maxServices} servicios</small>
              </RevealItem>
              <RevealItem className="lp-pricing-card featured">
                <span>Premium</span>
                <strong>{formatPrice(premium.priceClp)}<small> al mes</small></strong>
                <p>Más control, automatización y crecimiento.</p>
                <small>{premium.maxStaff} profesionales incluidos · reservas ilimitadas · tus colores y sin marca AuraBook</small>
              </RevealItem>
            </Reveal>
            <p className="lp-pricing-note">
              Prueba Premium {plans.trialDays} días gratis, sin tarjeta. Luego decides si continúas con Premium o usas Free.
              Precios en pesos chilenos, IVA incluido. <Link href="/precios">Ver planes y comparación completa <ArrowRight size={14} /></Link>
            </p>
          </section>
        )}

        <section className="lp-section lp-faq" id="preguntas">
          <SectionHeading eyebrow="Preguntas frecuentes" title="Lo que suelen preguntarnos." />
          <Reveal className="lp-faq-list">
            {FAQ.map((f) => (
              <RevealItem key={f.q}>
                <details>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              </RevealItem>
            ))}
          </Reveal>
        </section>
      </main>

      <section className="lp-final">
        <FinalHalo />
        <Reveal className="lp-final-inner">
          <RevealItem as="p" className="lp-final-eyebrow">Tu agenda online, lista hoy</RevealItem>
          <RevealItem as="h2">Empieza hoy con <span>tu negocio.</span></RevealItem>
          <RevealItem as="p" className="lp-final-lead">Configúralo tú mismo en minutos. Sin instalaciones ni contratos.</RevealItem>
          <RevealItem className="lp-final-actions">
            <Link href="/registro" className="lp-final-btn">Crear cuenta <ArrowRight size={18} /></Link>
            <a href="#como-funciona" className="lp-final-link">Ver cómo funciona</a>
          </RevealItem>
          <RevealItem as="ul" className="lp-final-checks">
            <li><Check size={16} /> Prueba gratis</li>
            <li><Check size={16} /> Sin tarjeta de crédito</li>
            <li><Check size={16} /> Tus clientes no descargan nada</li>
          </RevealItem>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
    </LandingMotion>
  );
}

/** Título de sección (etiqueta + h2) que aparece igual que el resto de los textos al entrar en pantalla. */
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <Reveal className="lp-heading">
      <RevealItem as="p" className="lp-eyebrow">{eyebrow}</RevealItem>
      <RevealItem as="h2">{title}</RevealItem>
    </Reveal>
  );
}
