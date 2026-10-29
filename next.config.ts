import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No anunciar la tecnología del servidor.
  poweredByHeader: false,
  // AVIF primero (más liviano), WebP como alternativa; next/image elige según el navegador.
  images: { formats: ["image/avif", "image/webp"] },
  // Cabeceras de seguridad para todas las rutas. La CSP se limita a lo que no rompe Next ni Turnstile:
  // nadie puede mostrar AuraBook dentro de un iframe (clickjacking), ni cambiar la base de los enlaces,
  // ni enviar formularios a otros sitios, ni cargar plugins.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
};

export default nextConfig;
