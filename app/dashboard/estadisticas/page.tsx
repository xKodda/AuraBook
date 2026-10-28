import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InsightsView } from "@/components/insights-view";
import { PageHead } from "@/components/manage/common";
import { PlanUpsell } from "@/components/plan-upsell";
import { getDashboardContext } from "@/lib/dashboard";
import { dateInTimeZone, monthRange } from "@/lib/dates";
import { getInsights } from "@/lib/insights";
import { can } from "@/lib/plans";

export const metadata: Metadata = { title: "Estadísticas | AuraBook", robots: { index: false, follow: false } };

export default async function InsightsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/dashboard");
  const { business } = ctx;
  const subtitle = business.role === "staff" ? "Tus citas, asistencia y clientes." : "Asistencia, clientes, horarios y ocupación de tu negocio.";

  if (!can(business.entitlements, "revenue_stats")) {
    return (
      <main className="dash-page">
        <PageHead title="Estadísticas" subtitle={subtitle} />
        <PlanUpsell feature="revenue_stats" canManage={business.role !== "staff"} />
      </main>
    );
  }

  const today = dateInTimeZone(new Date(), business.timezone);
  const { from, to } = monthRange(today);
  const initial = await getInsights(business, from, to);
  return (
    <main className="dash-page">
      <PageHead title="Estadísticas" subtitle={subtitle} />
      {"error" in initial
        ? <p className="form-error" role="alert">{initial.error}</p>
        : <InsightsView key={business.id} businessId={business.id} today={today} initial={initial} />}
    </main>
  );
}
