import type { Metadata } from "next";
import { BusinessSettings } from "@/components/manage/business-settings";
import { requireManager } from "@/lib/dashboard";
import { SITE_URL } from "@/lib/env";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Datos y marca | AuraBook" };

export default async function BusinessPage() {
  const { business, session } = await requireManager();
  const state = await getOnboardingState(business.id, session.userId);
  return <BusinessSettings key={business.id} initial={state} isOwner={business.role === "owner"} siteUrl={SITE_URL} />;
}
