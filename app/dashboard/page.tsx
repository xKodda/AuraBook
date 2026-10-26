import { redirect } from "next/navigation";
import { PanelExperience } from "@/components/panel-experience";
import { PanelRevenue } from "@/components/panel-revenue";
import { getDashboardContext } from "@/lib/dashboard";
import { dateInTimeZone } from "@/lib/dates";
import { getPanelCatalog, listPanelBookings, listPanelStaff } from "@/lib/panel";

export default async function DashboardPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");
  const { business } = ctx;
  const today = dateInTimeZone(new Date(), business.timezone);
  const [initialBookings, initialStaff, catalog] = await Promise.all([
    listPanelBookings(business, today),
    listPanelStaff(business.id),
    getPanelCatalog(business.id),
  ]);
  return (
    <>
      <PanelRevenue key={`rev-${business.id}`} business={business} today={today} />
      <PanelExperience
        key={business.id}
        business={business}
        initialStaff={initialStaff}
        initialBookings={initialBookings}
        initialDate={today}
        catalog={catalog}
      />
    </>
  );
}
