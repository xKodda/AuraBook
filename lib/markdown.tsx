// Renderizador mínimo de Markdown para los documentos legales (docs/legal/*.md).
// Soporta: # títulos, párrafos, listas «-» y «1.», «>» notas, **negrita**, *cursiva* y [enlaces](url).
// Produce elementos de React (sin HTML crudo), así que el texto nunca se interpreta como código.
import Link from "next/link";
import type { ReactNode } from "react";

export type Heading = { id: string; text: string; num?: string };
export type MetaField = { label: string; value: string };

const LEGAL_ROUTES: Record<string, string> = {
  "terminos.md": "/terminos",
  "privacidad.md": "/privacidad",
  "tratamiento-datos.md": "/tratamiento-datos",
  "seguridad.md": "/seguridad",
};

export function slugId(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{inline(m[2], k)}</em>);
    else {
      const href = LEGAL_ROUTES[m[4]] ?? m[4];
      out.push(/^https?:\/\//.test(href)
        ? <a key={k} href={href} target="_blank" rel="noreferrer">{m[3]}</a>
        : <Link key={k} href={href}>{m[3]}</Link>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Convierte el documento en bloques y devuelve también los títulos de sección (para el índice). */
export function renderMarkdown(source: string): { title: string; meta: MetaField[]; nodes: ReactNode[]; headings: Heading[] } {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  const headings: Heading[] = [];
  const meta: MetaField[] = [];
  let title = "";
  // Ficha del documento: líneas «**Campo:** valor» antes de la primera sección.
  const firstSection = lines.findIndex((l) => l.startsWith("## "));
  for (let n = 0; n < (firstSection < 0 ? lines.length : firstSection); n++) {
    const field = /^\*\*([^*]+):\*\*\s+(.+)$/.exec(lines[n].trim());
    if (field) { meta.push({ label: field[1], value: field[2].trim() }); lines[n] = ""; }
  }
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const key = `b${k++}`;
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      i++;
    } else if (line.startsWith("## ")) {
      const full = line.slice(3).trim();
      const numbered = /^(\d+)\.\s+(.+)$/.exec(full);
      const text = numbered ? numbered[2] : full;
      const num = numbered ? numbered[1].padStart(2, "0") : undefined;
      const id = slugId(full);
      headings.push({ id, text, num });
      nodes.push(
        <h2 key={key} id={id}>
          {num && <span className="legal-num" aria-hidden="true">{num}</span>}
          <span>{inline(text, key)}</span>
        </h2>,
      );
      i++;
    } else if (line.startsWith("### ")) {
      nodes.push(<h3 key={key}>{inline(line.slice(4).trim(), key)}</h3>);
      i++;
    } else if (/^(-|\d+\.) /.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(-|\d+\.) /.test(lines[i])) {
        let item = lines[i].replace(/^(-|\d+\.) /, "");
        i++;
        while (i < lines.length && /^ {2,}\S/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(item);
      }
      const children = items.map((t, n) => <li key={n}>{inline(t, `${key}-${n}`)}</li>);
      nodes.push(ordered ? <ol key={key}>{children}</ol> : <ul key={key}>{children}</ul>);
    } else if (line.startsWith(">")) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) parts.push(lines[i++].replace(/^>\s?/, ""));
      nodes.push(<aside key={key} className="legal-note">{inline(parts.join(" "), key)}</aside>);
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i++].split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
      }
      const [head, ...body] = rows;
      nodes.push(
        <div key={key} className="legal-table">
          <table>
            <thead><tr>{head.map((c, n) => <th key={n}>{inline(c, `${key}-h${n}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, n) => <tr key={n}>{r.map((c, m) => <td key={m}>{inline(c, `${key}-${n}-${m}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else {
      // Párrafo: líneas seguidas se unen con espacio (texto cortado a mano); antes de un «**Campo:**» va un salto.
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|-|\d+\. |>|\|)/.test(lines[i])) parts.push(lines[i++].trim());
      nodes.push(
        <p key={key}>
          {parts.flatMap((p, n) => {
            const content = inline(p, `${key}-${n}`);
            if (n === 0) return content;
            return /^\*\*[^*]+:\*\*/.test(p) ? [<br key={`br${n}`} />, ...content] : [" ", ...content];
          })}
        </p>,
      );
    }
  }
  return { title, meta, nodes, headings };
}
