// Programa Fundadores: tipos y textos compartidos (se puede importar desde componentes cliente).
// Los cupos se cuentan en la base de datos (supabase/migrations/20261115000000_founders_program.sql): un negocio
// recibe su número al publicar, si quedan cupos. La lectura está en lib/founders-server.ts.

import type { BusinessCategory } from "./types";

export type FounderWallEntry = {
  number: number;
  name: string;
  slug: string;
  category: BusinessCategory;
  logoUrl: string | null;
  brandColor: string;
};

export type FoundersSummary = {
  total: number;
  taken: number;
  months: number;
  wall: FounderWallEntry[];
  /** false = la base de datos no respondió y se muestran los valores de respaldo (sin contador). */
  live: boolean;
};

/** Sello del negocio en el panel y en su página de reservas. */
export type FounderStatus = { number: number; until: string | null; public: boolean };

export const FOUNDERS_FALLBACK: FoundersSummary = { total: 15, taken: 0, months: 6, wall: [], live: false };

/** Precio mensual congelado para los fundadores después de los meses gratis, aunque Premium suba. */
export const FOUNDER_PRICE_CLP = 12990;

export const foundersLeft = (s: FoundersSummary) => Math.max(0, s.total - s.taken);

/** «Quedan 13 cupos» con datos reales; «Solo 15 cupos» si no hay contador. */
export function foundersSpotsLabel(s: FoundersSummary): string {
  if (!s.live) return `Solo ${s.total} cupos`;
  const left = foundersLeft(s);
  return left === 1 ? "Queda 1 cupo" : `Quedan ${left} cupos`;
}

/** #03 */
export const founderNumberLabel = (n: number) => `#${String(n).padStart(2, "0")}`;

export const FOUNDERS_MESSAGE = "Hola, quiero un cupo del Programa Fundadores de AuraBook. Mi negocio es de ______";
