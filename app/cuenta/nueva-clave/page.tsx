import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewPasswordForm } from "@/components/auth-forms";
import { requireUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nueva contraseña | AuraBook",
  robots: { index: false, follow: false },
};

// Se llega aquí desde el enlace de recuperación (/auth/confirm crea la sesión) o con sesión activa.
export default async function NewPasswordPage() {
  if (DEMO_MODE) redirect("/dashboard");
  await requireUser("/cuenta/nueva-clave");
  return (
    <div className="auth-shell">
      <NewPasswordForm />
    </div>
  );
}
