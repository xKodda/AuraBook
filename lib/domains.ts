// Dominio oficial de AuraBook y dominios que redirigen a él. Sin dependencias: lo usan next.config.ts y las pruebas.

/** Origen canónico (sin barra final). Es el valor por defecto si NEXT_PUBLIC_SITE_URL no está definido. */
export const CANONICAL_ORIGIN = "https://aurabook.cl";

/** Hosts que redirigen (308) al canónico conservando la ruta: www y el subdominio anterior. */
export const LEGACY_HOSTS = ["www.aurabook.cl", "aurabook.clikium.cl"] as const;

/** Reglas de redirección de Next.js para los hosts antiguos. El host canónico nunca está en la lista (sin bucles). */
export function legacyHostRedirects() {
  return LEGACY_HOSTS.map((host) => ({
    source: "/:path*",
    has: [{ type: "host" as const, value: host }],
    destination: `${CANONICAL_ORIGIN}/:path*`,
    permanent: true,
  }));
}
