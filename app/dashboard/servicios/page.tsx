import type { Metadata } from "next";
import { ServicesManager } from "@/components/manage/services-manager";
import { requireManager } from "@/lib/dashboard";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Servicios | AuraBook" };

export default async function ServicesPage() {
  const { business, session } = await requireManager();
  const state = await getOnboardingState(business.id, session.userId);
  return <ServicesManager key={business.id} initial={state} entitlements={business.entitlements} />;
}
