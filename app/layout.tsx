import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#2F3A56" };

export const metadata: Metadata = {
  title: "AuraBook · Plataforma de Reservas",
  applicationName: "AuraBook",
  description: "Agenda tu cita en segundos en los mejores salones, barberías y centros de estética.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning: la portada marca data-intro en <html> antes de hidratar (components/landing-intro.tsx).
  return (
    <html lang="es-CL" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
