import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardContext } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel | AuraBook",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await getDashboardContext();
  if (!ctx) {
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
  return (
    <DashboardShell
      business={ctx.business}
      businesses={ctx.businesses}
      email={ctx.session.email}
      demo={ctx.session.demo}
      pendingOnboarding={ctx.pendingOnboarding}
      platformAdmin={ctx.platformAdmin}
    >
      {children}
    </DashboardShell>
  );
}
