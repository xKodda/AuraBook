import type { Metadata } from "next";
import { BookingExperience } from "@/components/booking-experience";
import { SANDBOX_BUSINESS } from "@/lib/sandbox";

export const metadata: Metadata = {
  title: "Demo: así reservan tus clientes | AuraBook",
  description: "Prueba una reserva en una barbería ficticia. Sin registrarte y sin que se guarde ningún dato.",
  alternates: { canonical: "/demo" },
  openGraph: { title: "Prueba AuraBook: así reservan tus clientes", url: "/demo" },
};

/** Demo pública: negocio ficticio, todo ocurre en el navegador (lib/sandbox.ts). */
export default function DemoPage() {
  return <BookingExperience business={SANDBOX_BUSINESS} demo sandbox />;
}
