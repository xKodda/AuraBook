import Link from "next/link";
import { AuraMark } from "@/components/aura-mark";
import { COMPANY, whatsappUrl } from "@/lib/company";
import { SiteMenu } from "@/components/site-menu";

/** Encabezado del sitio comercial. En la portada, «Cómo funciona» apunta a la misma página. En el celular, los enlaces van en SiteMenu. */
export function SiteHeader({ home = false }: { home?: boolean }) {
  const links = [
    { href: `${home ? "" : "/"}#como-funciona`, label: "Cómo funciona" },
    { href: "/precios", label: "Precios" },
    { href: "/demo", label: "Demo" },
    { href: "/nosotros", label: "Nosotros" },
  ];
  return (
    <header className="lp-header">
      <Link href="/" className="lp-brand"><AuraMark size={26} title="AuraBook" /><span>AURA<span>BOOK</span></span></Link>
      <nav className="lp-nav" aria-label="Principal">
        {links.map((l) => <Link key={l.href} href={l.href} className="lp-nav-link">{l.label}</Link>)}
        <Link href="/login" className="lp-nav-login">Ingresar</Link>
        <Link href="/registro" className="btn-primary lp-btn-sm">Crear cuenta</Link>
        <SiteMenu links={links} />
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
          <Link href="/fundadores">Programa Fundadores</Link>
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
