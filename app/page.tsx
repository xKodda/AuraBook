import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BellRing, CalendarCheck, CalendarX2, Check, Clock, Mail, Palette, ShieldCheck, Smartphone, UserPlus, Users,
} from "lucide-react";
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
      <div className="lp-toast">
        <Mail size={15} />
        <span><b>Nueva reserva</b><small>Corte de pelo · mañana 11:30</small></span>
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
        {rows.map(([h, a, s, b]) => (
          <div key={h} className="lp-agenda-row">
            <small>{h}</small>
            <span className={a === "Almuerzo" ? "off" : a ? "appt" : ""}>{a && <><b>{a}</b>{s && <small>{s}</small>}</>}</span>
            <span className={b === "Almuerzo" ? "off" : b ? "appt" : ""}>{b && <b>{b}</b>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="lp">
      <header className="lp-header">
        <Link href="/" className="lp-brand">AURA<span>BOOK</span></Link>
        <nav className="lp-nav" aria-label="Principal">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#preguntas">Preguntas</a>
          <Link href="/login" className="lp-nav-login">Ingresar</Link>
          <Link href="/registro" className="btn-primary lp-btn-sm">Crear cuenta</Link>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-text">
            <p className="lp-eyebrow">Reservas online · Hecho en Chile</p>
            <h1>Tu agenda llena, <span>sin perseguir mensajes.</span></h1>
            <p className="lp-lead">
              Una página de reservas con tu marca. Tus clientes eligen servicio, profesional y hora desde el celular;
              tú lo ves todo en un panel simple.
            </p>
            <div className="lp-actions">
              <Link href="/registro" className="btn-primary lp-btn">Crear mi página de reservas <ArrowRight size={17} /></Link>
              {DEMO_MODE
                ? <Link href="/reservar/barber-studio" className="lp-link">Ver un ejemplo</Link>
                : <a href="#como-funciona" className="lp-link">Ver cómo funciona</a>}
            </div>
            <ul className="lp-assurances">
              <li><Check size={15} /> Sin instalar nada</li>
              <li><Check size={15} /> Listo en minutos</li>
              <li><Check size={15} /> Tus clientes no crean cuenta</li>
            </ul>
          </div>
          <PhonePreview />
        </section>

        <div className="lp-rubros" aria-label="Para quién es">
          <span>Pensado para</span>
          {RUBROS.map((r) => <b key={r}>{r}</b>)}
        </div>

        <section className="lp-section" id="como-funciona">
          <p className="lp-eyebrow">Cómo funciona</p>
          <h2>De cero a recibir reservas, en tres pasos.</h2>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="lp-step-n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
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

        <section className="lp-section">
          <p className="lp-eyebrow">Lo esencial, bien hecho</p>
          <h2>Simple para ti. Más simple para tus clientes.</h2>
          <div className="lp-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="lp-feature">
                <Icon size={20} strokeWidth={1.8} />
                <div><h3>{title}</h3><p>{text}</p></div>
              </div>
            ))}
          </div>
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

      <section className="lp-final">
        <h2>Empieza hoy con tu negocio.</h2>
        <p>Configúralo tú mismo en minutos. Sin instalaciones ni contratos.</p>
        <Link href="/registro" className="lp-final-btn">Crear cuenta <ArrowRight size={17} /></Link>
      </section>

      <footer className="lp-footer">
        <span className="lp-brand">AURA<span>BOOK</span></span>
        <nav aria-label="Legal">
          <Link href="/terminos">Términos</Link>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/seguridad">Seguridad</Link>
          <Link href="/login">Acceso negocios</Link>
        </nav>
        <small>© {new Date().getFullYear()} AuraBook · Un producto de Clikium</small>
      </footer>
    </div>
  );
}
