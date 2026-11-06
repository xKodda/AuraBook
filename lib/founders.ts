// Programa Fundadores: banner del inicio y /fundadores.
// `taken` se actualiza a mano cada vez que entra un negocio fundador (el Premium gratis se registra en /admin
// como un pago de $0 por `freeMonths` meses). El contador tiene que ser real: nunca lo bajes para apurar a nadie.

export const FOUNDERS = {
  total: 15,
  taken: 0,
  freeMonths: 6,
  /** Precio mensual congelado para los fundadores después de los meses gratis, aunque Premium suba. */
  priceClp: 12990,
} as const;

export const foundersLeft = Math.max(0, FOUNDERS.total - FOUNDERS.taken);

export const FOUNDERS_MESSAGE = "Hola, quiero un cupo del Programa Fundadores de AuraBook. Mi negocio es de ______";
