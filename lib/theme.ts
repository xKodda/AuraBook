import type { CSSProperties } from "react";
import type { BusinessCategory } from "./types";

type CategoryCopy = {
  kicker: string;
  staffSingular: string;
  staffQuestion: string;
  serviceQuestion: string;
  headline: [string, string];
  footer: string;
};

export const CATEGORY_COPY: Record<BusinessCategory, CategoryCopy> = {
  barberia: {
    kicker: "BARBERÍA",
    staffSingular: "Barbero",
    staffQuestion: "Elige a tu barbero",
    serviceQuestion: "¿Qué servicio necesitas?",
    headline: ["Un buen corte", "empieza aquí."],
    footer: "BUEN CORTE. BUEN MOMENTO.",
  },
  peluqueria: {
    kicker: "PELUQUERÍA",
    staffSingular: "Estilista",
    staffQuestion: "Elige a tu estilista",
    serviceQuestion: "¿Qué quieres hacerte?",
    headline: ["Tu nuevo look", "empieza aquí."],
    footer: "TU ESTILO, TU MOMENTO.",
  },
  unas: {
    kicker: "ESTUDIO DE UÑAS",
    staffSingular: "Manicurista",
    staffQuestion: "Elige a tu manicurista",
    serviceQuestion: "¿Qué servicio quieres?",
    headline: ["Detalles que", "se notan."],
    footer: "CADA DETALLE CUENTA.",
  },
  spa: {
    kicker: "SPA & BIENESTAR",
    staffSingular: "Terapeuta",
    staffQuestion: "Elige a tu terapeuta",
    serviceQuestion: "¿Qué experiencia buscas?",
    headline: ["Un respiro", "empieza aquí."],
    footer: "TIEMPO PARA TI.",
  },
  estetica: {
    kicker: "CENTRO DE ESTÉTICA",
    staffSingular: "Especialista",
    staffQuestion: "Elige a tu especialista",
    serviceQuestion: "¿Qué tratamiento necesitas?",
    headline: ["Cuidarte", "empieza aquí."],
    footer: "CUIDADO PROFESIONAL.",
  },
  otro: {
    kicker: "ESTUDIO",
    staffSingular: "Profesional",
    staffQuestion: "Elige un profesional",
    serviceQuestion: "¿Qué servicio necesitas?",
    headline: ["Tu próxima visita", "empieza aquí."],
    footer: "RESERVA SIN COMPLICACIONES.",
  },
};

export const CATEGORY_LABEL: Record<BusinessCategory, string> = {
  barberia: "Barbería",
  peluqueria: "Peluquería",
  unas: "Belleza",
  spa: "Spa",
  estetica: "Estética",
  otro: "Otro",
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "2F3A56";
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * White-label: un único color de marca por negocio. El resto de tonos
 * (suaves, profundos, bordes) se derivan en CSS con color-mix().
 */
export function brandStyle(hex: string): CSSProperties {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#2F3A56";
  const contrast = luminance(hexToRgb(safe)) > 0.42 ? "#16161A" : "#FFFFFF";
  return { "--brand": safe, "--brand-contrast": contrast } as CSSProperties;
}
