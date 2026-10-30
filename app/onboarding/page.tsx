import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { requireUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/billing-server";
import { DEMO_MODE, SITE_URL } from "@/lib/env";
import { findPendingBusinessId, getOnboardingState, hasAnyMembership } from "@/lib/onboarding";
import type { OnboardingState } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configura tu negocio | AuraBook",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ nuevo?: string }> };

export default async function OnboardingPage({ searchParams }: Props) {
  if (DEMO_MODE) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <h2>Onboarding no disponible en demo</h2>
            <p>Configura Supabase (DEMO_MODE=false) para crear negocios reales.</p>
          </div>
        </div>
      </div>
    );
  }

  const user = await requireUser("/onboarding");
  const { nuevo } = await searchParams;

  // 1) Retomar un negocio propio sin publicar. 2) Si ya tiene negocios y no pidió uno nuevo, al panel.
  const pendingId = await findPendingBusinessId(user.id);
  if (!pendingId && nuevo !== "1" && (await hasAnyMembership(user.id))) redirect("/dashboard");
  // El admin de la plataforma no crea negocio salvo que lo pida explícitamente (?nuevo=1).
  if (!pendingId && nuevo !== "1" && (await isPlatformAdmin())) redirect("/admin");

  const initial: OnboardingState = pendingId
    ? await getOnboardingState(pendingId, user.id)
    : { business: null, staff: [], services: [], schedules: {} };

  return <OnboardingWizard initial={initial} userEmail={user.email ?? ""} siteUrl={SITE_URL} />;
}
