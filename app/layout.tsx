import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PUBLIC_ORIGIN } from "@/lib/env";

export const viewport: Viewport = { themeColor: "#2F3A56" };

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_ORIGIN),
  title: "AuraBook · Plataforma de Reservas",
  applicationName: "AuraBook",
  description: "Agenda tu cita en segundos en los mejores salones, barberías y centros de estética.",
  // La imagen para compartir la genera app/opengraph-image.tsx (y cada página de reservas la suya).
  openGraph: { type: "website", siteName: "AuraBook", locale: "es_CL" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning: la portada marca data-intro en <html> antes de hidratar (components/landing-intro.tsx).
  return (
    // data-scroll-behavior: el desplazamiento suave de globals.css no se aplica al cambiar de página (Next).
    <html lang="es-CL" suppressHydrationWarning data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
