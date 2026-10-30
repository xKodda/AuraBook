import type { NextConfig } from "next";
import { captchaConfigProblem } from "./lib/captcha-config";
import { legacyHostRedirects } from "./lib/domains";

// Turnstile a medias (una sola clave) bloquea o desprotege las reservas: el build falla y Vercel mantiene el último
// despliegue bueno (auditoría P1-06). Solo en builds de producción; `next dev` sigue funcionando.
const captchaProblem = captchaConfigProblem(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, process.env.TURNSTILE_SECRET_KEY);
if (captchaProblem && process.env.NODE_ENV === "production" && process.argv.includes("build")) {
  throw new Error(captchaProblem);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No anunciar la tecnología del servidor.
  poweredByHeader: false,
  // AVIF primero (más liviano), WebP como alternativa; next/image elige según el navegador.
  images: { formats: ["image/avif", "image/webp"] },
  // Dominio oficial: https://aurabook.cl (lib/domains.ts). www y el subdominio anterior redirigen a la misma ruta, así
  // los enlaces ya enviados por correo (confirmaciones, reservas) siguen funcionando.
  async redirects() {
    return legacyHostRedirects();
  },
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
    }, {
      // El service worker de avisos push siempre se revisa contra el servidor: una versión corregida llega al tiro.
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
    }];
  },
};

export default nextConfig;
