import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta | AuraBook",
  description: "Crea tu cuenta y publica la página de reservas de tu negocio.",
};

export default async function RegisterPage() {
  if (!DEMO_MODE && (await currentUser())) redirect("/dashboard");
  return (
    <div className="auth-shell">
      <SignUpForm demo={DEMO_MODE} />
    </div>
  );
}
