import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { AuraMark } from "@/components/aura-mark";
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
  const { title, nodes, headings } = renderMarkdown(source);
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <Link href="/" className="legal-brand"><AuraMark size={24} /><span>AURA<span>BOOK</span></span></Link>
        <Link href="/registro" className="legal-header-link">Crear cuenta</Link>
      </header>
      <div className="legal-layout">
        <nav className="legal-nav" aria-label="Documentos legales">
          <div className="legal-tabs">
            {LEGAL_DOCS.map((d) => (
              <Link key={d.href} href={d.href} className={`legal-tab${d.file === file ? " active" : ""}`}
                aria-current={d.file === file ? "page" : undefined}>
                {d.label}
              </Link>
            ))}
          </div>
          {headings.length > 3 && (
            <ol className="legal-toc">
              {headings.map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>)}
            </ol>
          )}
        </nav>
        <article className="legal-article">
          <h1>{title}</h1>
          {nodes}
        </article>
      </div>
      <footer className="legal-footer">
        <span>© AuraBook · Clikium</span>
        {LEGAL_DOCS.map((d) => <Link key={d.href} href={d.href}>{d.label}</Link>)}
      </footer>
    </div>
  );
}
