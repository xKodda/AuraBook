import type { MetadataRoute } from "next";

// Manifiesto de la app: nombre e íconos al instalar AuraBook en el celular (base para la PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AuraBook",
    short_name: "AuraBook",
    description: "Reservas online para barberías, peluquerías y salones.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F7F6F2",
    theme_color: "#2F3A56",
    lang: "es-CL",
    icons: [
      { src: "/brand/aurabook-icono.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/aurabook-icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/aurabook-icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/aurabook-icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
