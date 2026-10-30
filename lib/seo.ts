// Datos estructurados (schema.org) compartidos por las páginas públicas.
import { PUBLIC_ORIGIN } from "./env";
import type { PublicPlan } from "./plans";
import type { Business } from "./types";

const ORG_ID = `${PUBLIC_ORIGIN}/#organizacion`;

export const organizationLd = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: "AuraBook",
  url: PUBLIC_ORIGIN,
  logo: `${PUBLIC_ORIGIN}/brand/aurabook-icono-512.png`,
  email: "contacto@clikium.cl",
  areaServed: "CL",
  parentOrganization: { "@type": "Organization", name: "Clikium SpA", url: "https://clikium.cl/" },
};

export const websiteLd = {
  "@type": "WebSite",
  "@id": `${PUBLIC_ORIGIN}/#sitio`,
  name: "AuraBook",
  url: PUBLIC_ORIGIN,
  inLanguage: "es-CL",
  publisher: { "@id": ORG_ID },
};

/** AuraBook como software, con sus planes como ofertas (precios en CLP con IVA). */
export function softwareLd(plans: PublicPlan[], description: string) {
  return {
    "@type": "SoftwareApplication",
    name: "AuraBook",
    url: PUBLIC_ORIGIN,
    description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "es-CL",
    publisher: { "@id": ORG_ID },
    offers: plans.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: p.priceClp,
      priceCurrency: "CLP",
      description: p.description,
      url: `${PUBLIC_ORIGIN}/precios`,
    })),
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name, item: `${PUBLIC_ORIGIN}${it.path}`,
    })),
  };
}

/** Página de reservas de un negocio: negocio local con sus servicios y precios. */
export function businessLd(b: Business) {
  const url = `${PUBLIC_ORIGIN}/reservar/${b.slug}`;
  return {
    "@type": "LocalBusiness",
    "@id": `${url}#negocio`,
    name: b.name,
    url,
    ...(b.tagline || b.description ? { description: b.description || b.tagline } : {}),
    ...(b.logoUrl ? { image: b.logoUrl, logo: b.logoUrl } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.address ? { address: { "@type": "PostalAddress", streetAddress: b.address, addressCountry: "CL" } } : {}),
    potentialAction: { "@type": "ReserveAction", target: url },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Servicios",
      itemListElement: b.services.map((s) => ({
        "@type": "Offer",
        price: s.priceClp,
        priceCurrency: "CLP",
        itemOffered: { "@type": "Service", name: s.name, ...(s.description ? { description: s.description } : {}) },
      })),
    },
  };
}

/** Envuelve varios nodos en un solo grafo. */
export const graph = (...nodes: Record<string, unknown>[]) => ({ "@context": "https://schema.org", "@graph": nodes });
