import { redirect } from "next/navigation";
import { PanelExperience } from "@/components/panel-experience";
import { getDashboardContext } from "@/lib/dashboard";
import { dateInTimeZone } from "@/lib/dates";
import { listPanelBookings, listPanelStaff } from "@/lib/panel";

export default async function DashboardPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");
  const { business } = ctx;
  const today = dateInTimeZone(new Date(), business.timezone);
  const [initialBookings, initialStaff] = await Promise.all([
    listPanelBookings(business, today),
    listPanelStaff(business.id),
  ]);
  return (
    <PanelExperience
      key={business.id}
      business={business}
      initialStaff={initialStaff}
      initialBookings={initialBookings}
      initialDate={today}
    />
  );
}
