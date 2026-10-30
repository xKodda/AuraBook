import { redirect } from "next/navigation";
import { PanelExperience } from "@/components/panel-experience";
import { PanelRevenue } from "@/components/panel-revenue";
import { PlanUpsell } from "@/components/plan-upsell";
import { PushToggle } from "@/components/push-toggle";
import { VAPID_PUBLIC_KEY } from "@/lib/env";
import { PUSH_STATUS } from "@/lib/push";
import { can } from "@/lib/plans";
import { getDashboardContext } from "@/lib/dashboard";
import { dateInTimeZone } from "@/lib/dates";
import { getPanelCatalog, listPanelBookings, listPanelStaff, withClientHistory } from "@/lib/panel";
import { listDayTimeOff } from "@/lib/time-off";

export default async function DashboardPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");
  const { business } = ctx;
  const today = dateInTimeZone(new Date(), business.timezone);
  const [initialBookings, initialStaff, catalog, initialTimeOff] = await Promise.all([
    listPanelBookings(business, today),
    listPanelStaff(business.id),
    getPanelCatalog(business.id),
    listDayTimeOff(business, today),
  ]);
  return (
    <>
      {/* Los avisos push llegan a dueños y administradores (booking_push_targets). */}
      {PUSH_STATUS.configured && business.role !== "staff" && <PushToggle publicKey={VAPID_PUBLIC_KEY} variant="banner" />}
      {can(business.entitlements, "revenue_stats")
        ? <PanelRevenue key={`rev-${business.id}`} business={business} today={today} />
        : <PlanUpsell feature="revenue_stats" canManage={business.role !== "staff"} />}
      <PanelExperience
        key={business.id}
        business={business}
        initialStaff={initialStaff}
        initialBookings={await withClientHistory(business, initialBookings)}
        initialDate={today}
        catalog={catalog}
        initialTimeOff={initialTimeOff}
      />
    </>
  );
}
