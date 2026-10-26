import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { AuraMark } from "@/components/aura-mark";
import { LegalToc } from "@/components/legal-toc";
import { renderMarkdown } from "@/lib/markdown";

export const LEGAL_DOCS = [
  { href: "/terminos", file: "terminos.md", label: "Términos" },
  { href: "/privacidad", file: "privacidad.md", label: "Privacidad" },
  { href: "/tratamiento-datos", file: "tratamiento-datos.md", label: "Tratamiento de datos" },
  { href: "/seguridad", file: "seguridad.md", label: "Seguridad" },
] as const;

export function legalTitle(file: string): string {
  return readFileSync(join(process.cwd(), "docs", "legal", file), "utf8").match(/^# (.+)$/m)?.[1] ?? "AuraBook";
}

/** Página pública de un documento legal. Se genera en el build a partir de docs/legal/<file>. */
export function LegalPage({ file }: { file: string }) {
  const source = readFileSync(join(process.cwd(), "docs", "legal", file), "utf8");
  const { title, meta, nodes, headings } = renderMarkdown(source);
  const withToc = headings.length > 3;
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <Link href="/" className="legal-brand"><AuraMark size={24} /><span>AURA<span>BOOK</span></span></Link>
        <Link href="/registro" className="legal-header-link">Crear cuenta</Link>
      </header>

      <section className="legal-hero">
        <div className="legal-hero-inner">
          <nav className="legal-tabs" aria-label="Documentos legales">
            {LEGAL_DOCS.map((d) => (
              <Link key={d.href} href={d.href} className={`legal-tab${d.file === file ? " active" : ""}`}
                aria-current={d.file === file ? "page" : undefined}>
                {d.label}
              </Link>
            ))}
          </nav>
          <p className="legal-eyebrow">Documento oficial</p>
          <h1>{title}</h1>
          {meta.length > 0 && (
            <dl className="legal-meta">
              {meta.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{/@/.test(f.value) ? <a href={`mailto:${f.value}`}>{f.value}</a> : f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <div className={`legal-layout${withToc ? "" : " no-toc"}`}>
        {withToc && (
          <aside className="legal-nav" aria-label="En este documento">
            {/* Escritorio: índice fijo al costado. Celular: desplegable sobre el texto. */}
            <div className="legal-toc-desktop">
              <p className="legal-toc-title">En este documento</p>
              <LegalToc headings={headings} />
            </div>
            <details className="legal-toc-mobile">
              <summary>En este documento <span>{headings.length} secciones</span></summary>
              <LegalToc headings={headings} />
            </details>
          </aside>
        )}
        <article className="legal-article">{nodes}</article>
      </div>

      <footer className="legal-footer">
        <span className="legal-brand"><AuraMark size={20} /><span>AURA<span>BOOK</span></span></span>
        <nav aria-label="Legal">
          {LEGAL_DOCS.map((d) => <Link key={d.href} href={d.href}>{d.label}</Link>)}
        </nav>
        <small>© {new Date().getFullYear()} AuraBook · Un producto de <a href="https://clikium.cl/" target="_blank" rel="noopener">Clikium</a></small>
      </footer>
    </div>
  );
}
