import type { Metadata } from "next";
import { TimeOffManager } from "@/components/manage/time-off-manager";
import { requireManager } from "@/lib/dashboard";
import { dateInTimeZone } from "@/lib/dates";
import { listPanelStaff } from "@/lib/panel";
import { listUpcomingTimeOff } from "@/lib/time-off";

export const metadata: Metadata = { title: "Bloqueos | AuraBook" };

export default async function TimeOffPage() {
  const { business } = await requireManager();
  const [blocks, staff] = await Promise.all([listUpcomingTimeOff(business), listPanelStaff(business.id)]);
  return (
    <TimeOffManager key={business.id} initial={blocks} staff={staff} today={dateInTimeZone(new Date(), business.timezone)} />
  );
}
