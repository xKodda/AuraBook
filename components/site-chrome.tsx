import Link from "next/link";
import { AuraMark } from "@/components/aura-mark";

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
        <Link href="/login" className="lp-nav-login">Ingresar</Link>
        <Link href="/registro" className="btn-primary lp-btn-sm">Crear cuenta</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <span className="lp-brand"><AuraMark size={22} /><span>AURA<span>BOOK</span></span></span>
      <nav aria-label="Sitio">
        <Link href="/precios">Precios</Link>
        <Link href="/demo">Demo</Link>
        <Link href="/terminos">Términos</Link>
        <Link href="/privacidad">Privacidad</Link>
        <Link href="/seguridad">Seguridad</Link>
        <Link href="/login">Acceso negocios</Link>
      </nav>
      <small>© {new Date().getFullYear()} AuraBook · Un producto de <a href="https://clikium.cl/" target="_blank" rel="noopener">Clikium</a></small>
    </footer>
  );
}
