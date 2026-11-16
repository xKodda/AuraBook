import Link from "next/link";
import { founderNumberLabel } from "@/lib/founders";

/**
 * Medalla «Negocio Fundador»: anillo dorado, centro azul AuraBook y el número del negocio. SVG puro (sin imágenes),
 * nítida en cualquier tamaño. Los ids de los degradados llevan el número para no chocar con otra medalla en la página.
 */
export function FounderSeal({ number, size = 96 }: { number: number; size?: number }) {
  const id = `fs-${number}-${size}`;
  return (
    <svg className="founder-seal" width={size} height={size} viewBox="0 0 120 120" role="img"
      aria-label={`Negocio Fundador AuraBook ${founderNumberLabel(number)}`}>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F1DDA4" />
          <stop offset=".5" stopColor="#C9A24B" />
          <stop offset="1" stopColor="#9C7A2E" />
        </linearGradient>
        <path id={`${id}-ring`} d="M60 60 m-41 0 a41 41 0 1 1 82 0 a41 41 0 1 1 -82 0" />
      </defs>
      <circle cx="60" cy="60" r="59" fill={`url(#${id}-gold)`} />
      <circle cx="60" cy="60" r="52" fill="#2F3A56" />
      <circle cx="60" cy="60" r="31" fill="none" stroke="#C9A24B" strokeOpacity=".55" strokeWidth="1" />
      <text fill="#E9D29A" fontSize="9" fontWeight="800" letterSpacing="1.6">
        <textPath href={`#${id}-ring`} startOffset="0" textLength="250" lengthAdjust="spacing">
          NEGOCIO FUNDADOR · AURABOOK ·
        </textPath>
      </text>
      <path d="M60 37.5l1.9 4.1 4.4.5-3.3 3 .9 4.4L60 47.3l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" fill="#E9D29A" />
      <text x="60" y="73" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="800" letterSpacing="-.5">
        {founderNumberLabel(number)}
      </text>
      <text x="60" y="84" textAnchor="middle" fill="#E9D29A" fontSize="6.5" fontWeight="700" letterSpacing="1.4">2026</text>
    </svg>
  );
}

/** Sello compacto para la página de reservas del negocio: lleva a /fundadores en aurabook.cl. */
export function FounderChip({ number }: { number: number }) {
  return (
    <Link href="/fundadores" className="founder-chip" title="Uno de los primeros negocios en AuraBook">
      <FounderSeal number={number} size={30} />
      <span><b>Negocio Fundador</b><small>AuraBook {founderNumberLabel(number)}</small></span>
    </Link>
  );
}
