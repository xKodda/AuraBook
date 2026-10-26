import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BellRing, CalendarCheck, CalendarX2, Check, Clock, Mail, Palette, ShieldCheck, Smartphone, UserPlus, Users,
} from "lucide-react";
import { AuraMark } from "@/components/aura-mark";
import { HeroPhone, LandingMotion, PopIn, Reveal, RevealImage, RevealItem, ScrollZoom } from "@/components/landing-motion";
import fotoTijeras from "@/public/photos/barberia-tijeras.jpg";
import fotoBarberia from "@/public/photos/barberia-herramientas.jpg";
import fotoUnas from "@/public/photos/unas-manicure.jpg";
import fotoCliente from "@/public/photos/cliente-reservando.jpg";
import { DEMO_MODE } from "@/lib/env";

export const metadata: Metadata = {
  title: "AuraBook · Reservas online para barberías, peluquerías y salones",
  description:
    "Tu página de reservas con tu marca, lista en minutos. Tus clientes agendan desde el celular, sin descargar apps ni crear cuentas.",
};

const RUBROS = ["Barberías", "Peluquerías", "Salones de uñas", "Estética", "Spa"];

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
  { icon: Palette, title: "Con tu marca", text: "Tu logo y tu color en la página que ven tus clientes." },
  { icon: Users, title: "Tu equipo ordenado", text: "Cada profesional con sus servicios y su horario." },
];

const FAQ = [
  { q: "¿Mis clientes tienen que crear una cuenta?", a: "No. Eligen servicio, profesional y hora, y dejan su nombre y teléfono. Reciben un enlace para ver o cancelar su cita." },
  { q: "¿Qué pasa si dos personas intentan reservar la misma hora?", a: "Solo una lo consigue. La disponibilidad se vuelve a verificar al confirmar y la base de datos impide horas solapadas." },
  { q: "¿Necesito instalar algo?", a: "No. Funciona en el navegador del computador y del celular, tanto para ti como para tus clientes." },
  { q: "¿Puedo usar mi logo y mis colores?", a: "Sí. Subes tu logo y eliges el color de tu marca; así se ve tu página de reservas." },
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
          {["10:00", "10:45", "11:30", "12:15", "15:00", "15:45"].map((t) => (
            <span key={t} className={t === "11:30" ? "on" : undefined}>{t}</span>
          ))}
        </div>
        <div className="lp-mini-cta">Confirmar 11:30 h</div>
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
        <span>aurabook.clikium.cl/reservar/barberia-don-jose</span>
      </div>
      <div className="lp-browser-page">
        <div className="lp-browser-biz">
          <span className="lp-mini-logo">DJ</span>
          <small>BARBERÍA</small>
          <b>Barbería Don José</b>
          <p>Un buen corte empieza aquí.</p>
          <hr />
          <p>Av. Providencia 1234</p>
          <p>+56 9 1234 5678</p>
        </div>
        <div className="lp-browser-main">
          <p className="lp-mini-label"><span>1</span> ¿Qué servicio necesitas?</p>
          <div className="lp-mini-service on"><i /><span><b>Corte de pelo</b><small>45 min</small></span><b>$12.000</b></div>
          <div className="lp-mini-service"><i /><span><b>Corte + barba</b><small>60 min</small></span><b>$16.000</b></div>
          <div className="lp-mini-service"><i /><span><b>Perfilado de barba</b><small>30 min</small></span><b>$8.000</b></div>
          <p className="lp-mini-label"><span>2</span> Día y hora</p>
          <div className="lp-browser-days">
            {["hoy 27", "mié 28", "jue 29", "vie 30", "sáb 31"].map((d, i) => <span key={d} className={i === 1 ? "on" : undefined}>{d}</span>)}
          </div>
          <div className="lp-mini-times lp-browser-times">
            {["10:00", "10:45", "11:30", "12:15", "15:00", "15:45", "16:30", "17:15"].map((t) => (
              <span key={t} className={t === "11:30" ? "on" : undefined}>{t}</span>
            ))}
          </div>
          <div className="lp-mini-cta">Confirmar miércoles 28, 11:30 h</div>
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

export default function Home() {
  return (
    <LandingMotion>
    <div className="lp">
      <header className="lp-header">
        <Link href="/" className="lp-brand"><AuraMark size={26} title="AuraBook" /><span>AURA<span>BOOK</span></span></Link>
        <nav className="lp-nav" aria-label="Principal">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#preguntas">Preguntas</a>
          <Link href="/login" className="lp-nav-login">Ingresar</Link>
          <Link href="/registro" className="btn-primary lp-btn-sm">Crear cuenta</Link>
        </nav>
      </header>

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
              {DEMO_MODE
                ? <Link href="/reservar/barber-studio" className="lp-link">Ver un ejemplo</Link>
                : <a href="#como-funciona" className="lp-link">Ver cómo funciona</a>}
            </RevealItem>
            <RevealItem>
            <ul className="lp-assurances">
              <li><Check size={15} /> Sin instalar nada</li>
              <li><Check size={15} /> Listo en minutos</li>
              <li><Check size={15} /> Tus clientes no crean cuenta</li>
            </ul>
            </RevealItem>
          </Reveal>
          <HeroPhone toast={<><Mail size={15} /><span><b>Nueva reserva</b><small>Corte de pelo · mañana 11:30</small></span></>}>
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
          <p className="lp-eyebrow">Cómo funciona</p>
          <h2>De cero a recibir reservas, en tres pasos.</h2>
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

        <section className="lp-section lp-rubros-photos">
          <p className="lp-eyebrow">Pensado para tu rubro</p>
          <h2>Para negocios que trabajan con hora.</h2>
          <div className="lp-photo-pair">
            <figure>
              <RevealImage className="lp-photo lp-photo-tall">
                <Image src={fotoBarberia} alt="Máquina de cortar pelo, peinetas y escobilla sobre una toalla gris" fill placeholder="blur"
                  sizes="(max-width: 720px) 100vw, 45vw" style={{ objectFit: "cover" }} />
              </RevealImage>
              <figcaption><b>Barberías</b> Cortes, barba y perfilados, cada barbero con su agenda.</figcaption>
            </figure>
            <figure>
              <RevealImage className="lp-photo lp-photo-tall">
                <Image src={fotoUnas} alt="Manicurista pintando una uña con un pincel fino" fill placeholder="blur"
                  sizes="(max-width: 720px) 100vw, 45vw" style={{ objectFit: "cover" }} />
              </RevealImage>
              <figcaption><b>Salones de uñas</b> Servicios de distinta duración sin que se crucen las horas.</figcaption>
            </figure>
          </div>
          <p className="lp-rubros-more">También peluquerías, centros de estética y spa.</p>
        </section>

        <section className="lp-section">
          <p className="lp-eyebrow">Lo esencial, bien hecho</p>
          <h2>Simple para ti. Más simple para tus clientes.</h2>
          <Reveal className="lp-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <RevealItem key={title} className="lp-feature">
                <Icon size={20} strokeWidth={1.8} />
                <div><h3>{title}</h3><p>{text}</p></div>
              </RevealItem>
            ))}
          </Reveal>
        </section>

        <section className="lp-section lp-faq" id="preguntas">
          <p className="lp-eyebrow">Preguntas frecuentes</p>
          <h2>Lo que suelen preguntarnos.</h2>
          <div>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <Reveal as="section" className="lp-final">
        <RevealItem as="h2">Empieza hoy con tu negocio.</RevealItem>
        <RevealItem as="p">Configúralo tú mismo en minutos. Sin instalaciones ni contratos.</RevealItem>
        <RevealItem><Link href="/registro" className="lp-final-btn">Crear cuenta <ArrowRight size={17} /></Link></RevealItem>
      </Reveal>

      <footer className="lp-footer">
        <span className="lp-brand"><AuraMark size={22} /><span>AURA<span>BOOK</span></span></span>
        <nav aria-label="Legal">
          <Link href="/terminos">Términos</Link>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/seguridad">Seguridad</Link>
          <Link href="/login">Acceso negocios</Link>
        </nav>
        <small>© {new Date().getFullYear()} AuraBook · Un producto de Clikium</small>
      </footer>
    </div>
    </LandingMotion>
  );
}
