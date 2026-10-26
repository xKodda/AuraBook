import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No anunciar la tecnología del servidor.
  poweredByHeader: false,
  // AVIF primero (más liviano), WebP como alternativa; next/image elige según el navegador.
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
