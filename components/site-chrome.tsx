import Link from "next/link";
import { AuraMark } from "@/components/aura-mark";
import { COMPANY, whatsappUrl } from "@/lib/company";
import { foundersLeft } from "@/lib/founders";

/** Encabezado del sitio comercial. En la portada, los enlaces de sección apuntan a la misma página. */
export function SiteHeader({ home = false }: { home?: boolean }) {
  const base = home ? "" : "/";
  return (
    <header className="lp-header">
      <Link href="/" className="lp-brand"><AuraMark size={26} title="AuraBook" /><span>AURA<span>BOOK</span></span></Link>
      <nav className="lp-nav" aria-label="Principal">
        <a href={`${base}#como-funciona`}>Cómo funciona</a>
        <Link href="/precios">Precios</Link>
        <Link href="/demo">Demo</Link>
        <Link href="/para/talleres-mecanicos">Talleres</Link>
        <Link href="/para/consultas-de-salud">Salud</Link>
        <Link href="/para/veterinarias">Veterinarias</Link>
        <Link href="/para/barberias">Barberías</Link>
        <Link href="/login" className="lp-nav-login">Ingresar</Link>
        <Link href="/registro" className="btn-primary lp-btn-sm">Crear cuenta</Link>
      </nav>
    </header>
  );
}

/** Pie del sitio comercial y de las páginas legales. */
export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-top">
        <div className="lp-footer-about">
          <span className="lp-brand"><AuraMark size={22} /><span>AURA<span>BOOK</span></span></span>
          <p className="lp-footer-tagline">AuraBook — Tu agenda llena, sin perseguir mensajes.</p>
          <p>Hecho en Chile por {COMPANY.legalName} · RUT {COMPANY.rut}</p>
          <p>
            ¿Dudas? Escríbenos por <a href={whatsappUrl()} target="_blank" rel="noopener">WhatsApp {COMPANY.whatsappDisplay}</a>.
            {" "}Respondemos {COMPANY.hours}.
          </p>
        </div>
        <nav aria-label="Producto">
          <p>Producto</p>
          <Link href="/precios">Precios</Link>
          <Link href="/demo">Demo</Link>
          <Link href="/seguridad">Seguridad</Link>
          {foundersLeft > 0 && <Link href="/fundadores">Programa Fundadores</Link>}
        </nav>
        <nav aria-label="Empresa">
          <p>Empresa</p>
          <Link href="/nosotros">Nosotros</Link>
          <Link href="/nosotros#contacto">Contacto</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/privacidad">Privacidad</Link>
        </nav>
      </div>
      <small>© {new Date().getFullYear()} AuraBook · Un producto de <a href="https://clikium.cl/" target="_blank" rel="noopener">Clikium</a></small>
    </footer>
  );
}
