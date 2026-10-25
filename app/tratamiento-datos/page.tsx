import type { Metadata } from "next";
import { LegalPage, legalTitle } from "@/components/legal-page";

export const dynamic = "force-static";

export const metadata: Metadata = { title: `${legalTitle("tratamiento-datos.md")} | AuraBook` };

export default function Page() {
  return <LegalPage file="tratamiento-datos.md" />;
}
