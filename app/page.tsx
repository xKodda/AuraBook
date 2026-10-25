import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, CalendarCheck, Clock, Link2, ShieldCheck, Smartphone, Store, UserCheck, Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { DEMO_MODE } from "@/lib/env";
import { CATEGORY_LABEL } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AuraBook · Reservas online para barberías, peluquerías y salones",
  description:
    "Tu página de reservas lista en minutos. Tus clientes agendan desde el celular, sin descargar apps ni registrarse.",
};

const STEPS = [
  { icon: Store, title: "Crea tu negocio", text: "Nombre, rubro, dirección y contacto. Te damos tu enlace propio." },
  { icon: Users, title: "Agrega equipo y horarios", text: "Quién atiende, cuándo trabaja y sus descansos." },
  { icon: Link2, title: "Comparte tu enlace", text: "Ponlo en Instagram, WhatsApp o Google Maps y empieza a recibir citas." },
];

const BENEFITS = [
  { icon: Smartphone, title: "Pensado para el celular", text: "Tus clientes reservan en pocos toques, sin apps ni contraseñas." },
  { icon: CalendarCheck, title: "Disponibilidad real", text: "Respeta la duración de cada servicio, descansos y bloqueos." },
  { icon: ShieldCheck, title: "Sin citas duplicadas", text: "Dos personas nunca pueden quedar en el mismo horario." },
  { icon: Clock, title: "Cancelación autogestionada", text: "Cada cliente recibe un enlace para ver o cancelar su cita." },
  { icon: UserCheck, title: "Tu equipo, tu control", text: "Roles para propietario, administración y profesionales." },
  { icon: Store, title: "Reservas manuales", text: "Agenda también las citas que llegan por WhatsApp o en persona." },
];

export default function Home() {
  return (
    <div className="landing">
      <header className="site-header landing-header">
        <BrandMark />
        <nav className="header-links">
          <Link href="/login" className="header-action-btn">Ingresar</Link>
          <Link href="/registro" className="btn-primary landing-cta-sm">Crear cuenta</Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <span className="eyebrow"><span className="eyebrow-line" /> Reservas online · Hecho en Chile</span>
          <h1>Tu agenda llena,<br /><em>sin perseguir mensajes.</em></h1>
          <p>
            AuraBook le da a tu barbería, peluquería o salón una página de reservas propia. Tus clientes eligen
            servicio, profesional y horario desde el celular; tú ves todo en un solo panel.
          </p>
          <div className="landing-actions">
            <Link href="/registro" className="btn-primary landing-cta">
              Crear mi página de reservas <ArrowRight size={16} />
            </Link>
            {DEMO_MODE && (
              <Link href="/reservar/barber-studio" className="btn-secondary landing-cta">Ver un ejemplo</Link>
            )}
          </div>
          <ul className="landing-rubros" aria-label="Rubros">
            {Object.values(CATEGORY_LABEL).filter((l) => l !== "Otro").map((label) => <li key={label}>{label}</li>)}
          </ul>
        </section>

        <section className="landing-section">
          <span className="label-overline">Cómo funciona</span>
          <h2>Listo en tres pasos</h2>
          <ol className="landing-steps">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title}>
                <span className="landing-step-number">{i + 1}</span>
                <Icon size={22} strokeWidth={1.8} />
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section">
          <span className="label-overline">Lo esencial, bien hecho</span>
          <h2>Simple para ti y para tus clientes</h2>
          <div className="landing-benefits">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={20} strokeWidth={1.8} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-final">
          <h2>Empieza hoy con tu negocio</h2>
          <p>Configúralo tú mismo en minutos. Sin instalaciones.</p>
          <Link href="/registro" className="btn-primary landing-cta">
            Crear cuenta <ArrowRight size={16} />
          </Link>
        </section>
      </main>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} AuraBook · Un producto de Clikium</span>
        <span><Link href="/login">Acceso negocios</Link></span>
      </footer>
    </div>
  );
}
