import type { Metadata } from "next";
import { ResetRequestForm } from "@/components/auth-forms";
import { DEMO_MODE } from "@/lib/env";

export const metadata: Metadata = {
  title: "Recuperar contraseña | AuraBook",
  robots: { index: false, follow: false },
};

export default function RecoverPage() {
  return (
    <div className="auth-shell">
      <ResetRequestForm demo={DEMO_MODE} />
    </div>
  );
}
