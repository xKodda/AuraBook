import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuraBook · Plataforma de Reservas",
  description: "Agenda tu cita en segundos en los mejores salones, barberías y centros de estética.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
