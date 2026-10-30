import type { Metadata } from "next";
import { LaunchCountdown } from "@/components/launch-countdown";

export const metadata: Metadata = {
  title: "AuraBook · Cuenta regresiva",
  robots: { index: false, follow: false },
};

// Viernes 30 de octubre de 2026, 00:00 en Chile (horario de verano, UTC-3).
const LAUNCH_AT = "2026-10-30T00:00:00-03:00";

export default function LanzamientoPage() {
  return <LaunchCountdown target={LAUNCH_AT} />;
}
