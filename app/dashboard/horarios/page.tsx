import type { Metadata } from "next";
import { ScheduleManager } from "@/components/manage/schedule-manager";
import { requireManager } from "@/lib/dashboard";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Horarios | AuraBook" };

type Props = { searchParams: Promise<{ persona?: string }> };

export default async function SchedulePage({ searchParams }: Props) {
  const { business, session } = await requireManager();
  const [state, { persona }] = await Promise.all([getOnboardingState(business.id, session.userId), searchParams]);
  return <ScheduleManager key={`${business.id}-${persona ?? ""}`} initial={state} initialStaffId={persona} />;
}
