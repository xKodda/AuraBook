import type { Metadata } from "next";
import { TeamManager } from "@/components/manage/team-manager";
import { requireManager } from "@/lib/dashboard";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Equipo | AuraBook" };

export default async function TeamPage() {
  const { business, session } = await requireManager();
  const state = await getOnboardingState(business.id, session.userId);
  return <TeamManager key={business.id} initial={state} entitlements={business.entitlements} />;
}
