"use client";

// Índice del documento legal: marca la sección que se está leyendo y ofrece imprimir o guardar en PDF.

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { Heading } from "@/lib/markdown";

export function LegalToc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState(headings[0]?.id ?? "");

  useEffect(() => {
    const targets = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => !!el);
    // La sección activa es la última cuyo título ya pasó el tercio superior de la pantalla.
    const update = () => {
      const line = window.innerHeight * 0.3;
      let current = targets[0]?.id ?? "";
      for (const el of targets) if (el.getBoundingClientRect().top <= line) current = el.id;
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [headings]);

  return (
    <>
      <ol className="legal-toc">
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className={h.id === active ? "active" : undefined} aria-current={h.id === active ? "location" : undefined}>
              {h.num && <span>{h.num}</span>}{h.text}
            </a>
          </li>
        ))}
      </ol>
      <button type="button" className="legal-print" onClick={() => window.print()}>
        <Printer size={15} /> Imprimir o guardar PDF
      </button>
    </>
  );
}
