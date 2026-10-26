import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN } from "@/lib/env";

/** Las zonas privadas (panel, cuentas, enlaces de gestión de cada cliente) no se indexan. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/api/", "/onboarding", "/reserva/", "/cuenta", "/auth/", "/panel", "/login", "/recuperar"],
    },
    sitemap: `${PUBLIC_ORIGIN}/sitemap.xml`,
    host: PUBLIC_ORIGIN,
  };
}
