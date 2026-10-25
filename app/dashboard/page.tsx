import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isPlatformAdmin } from "@/lib/billing-server";
import { dateInTimeZone } from "@/lib/dates";
import { getPanelSession, listPanelBookings, listPanelStaff } from "@/lib/panel";
import { PanelExperience } from "@/components/panel-experience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel de Gestión | AuraBook",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const session = await getPanelSession();
  if (!session) redirect("/login?next=/dashboard");

  // Solo los negocios publicados tienen agenda; el resto sigue en configuración.
  const published = session.businesses.filter((b) => b.published);
  const pendingOnboarding = session.businesses.some((b) => !b.published && b.role === "owner");
  if (published.length === 0) {
    if (pendingOnboarding || session.businesses.length === 0) redirect("/onboarding");
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <h2>Tu negocio aún no está publicado</h2>
            <p>El propietario debe terminar la configuración antes de que puedas ver la agenda.</p>
          </div>
          <form action="/auth/logout" method="POST">
            <button type="submit" className="btn-secondary auth-wide">Cerrar sesión</button>
          </form>
        </div>
      </div>
    );
  }

  const defaultBusiness = published[0];
  const today = dateInTimeZone(new Date(), defaultBusiness.timezone);

  const [initialBookings, initialStaff] = await Promise.all([
    listPanelBookings(defaultBusiness, today),
    listPanelStaff(defaultBusiness.id),
  ]);

  return (
    <PanelExperience
      initialBusinesses={published}
      initialStaff={initialStaff}
      initialBookings={initialBookings}
      initialDate={today}
      userEmail={session.email}
      demo={session.demo}
      pendingOnboarding={pendingOnboarding}
      platformAdmin={await isPlatformAdmin()}
    />
  );
}
