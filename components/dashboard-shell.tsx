"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays, Clock, CreditCard, ExternalLink, LayoutGrid, LogOut, Menu, Palette, Scissors, Shield, Users, X,
} from "lucide-react";
import { selectBusinessAction } from "@/app/dashboard/actions";
import { BusinessLogo } from "@/components/business-logo";
import { billingAlert } from "@/lib/billing";
import { brandStyle } from "@/lib/theme";
import type { PanelBusiness } from "@/lib/types";

const ROLE_LABEL: Record<PanelBusiness["role"], string> = {
  owner: "Propietario",
  admin: "Administrador",
  staff: "Profesional",
};

type Item = { href: string; label: string; icon: typeof CalendarDays; external?: boolean };

type Props = {
  business: PanelBusiness;
  businesses: PanelBusiness[];
  email: string | null;
  demo: boolean;
  pendingOnboarding: boolean;
  platformAdmin: boolean;
  children: ReactNode;
};

export function DashboardShell({ business, businesses, email, demo, pendingOnboarding, platformAdmin, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, startSwitch] = useTransition();
  const manager = business.role !== "staff";
  const notice = manager ? billingAlert(business.billing) : null;

  const groups: { title?: string; items: Item[] }[] = [
    { items: [{ href: "/dashboard", label: "Agenda", icon: CalendarDays }] },
    ...(manager ? [{
      title: "MI NEGOCIO",
      items: [
        { href: "/dashboard/equipo", label: "Equipo", icon: Users },
        { href: "/dashboard/servicios", label: "Servicios", icon: Scissors },
        { href: "/dashboard/horarios", label: "Horarios", icon: Clock },
        { href: "/dashboard/negocio", label: "Datos y marca", icon: Palette },
      ],
    }] : []),
    {
      title: "CUENTA",
      items: [
        ...(manager ? [{ href: "/dashboard/plan", label: "Mi plan", icon: CreditCard }] : []),
        ...(platformAdmin ? [{ href: "/admin", label: "Plataforma", icon: Shield }] : []),
        { href: `/reservar/${business.slug}`, label: "Mi página de reservas", icon: ExternalLink, external: true },
      ],
    },
  ];

  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  function switchBusiness(id: string) {
    startSwitch(async () => {
      await selectBusinessAction(id);
      router.refresh();
    });
  }

  const nav = (
    <>
      <div className="dash-business">
        <BusinessLogo name={business.name} url={business.logoUrl ?? null} brandColor={business.brandColor} size={38} />
        <div className="dash-business-text">
          {businesses.length > 1 ? (
            <select value={business.id} disabled={switching} onChange={(e) => switchBusiness(e.target.value)}
              aria-label="Negocio que administras">
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : <strong>{business.name}</strong>}
          <span>{ROLE_LABEL[business.role]}</span>
        </div>
      </div>
      {groups.map((g, i) => (
        <div key={g.title ?? i} className="dash-nav-group">
          {g.title && <span className="dash-nav-title">{g.title}</span>}
          {g.items.map(({ href, label, icon: Icon, external }) => (
            <Link key={href} href={href} className={`dash-nav-link${isActive(href) ? " active" : ""}`}
              aria-current={isActive(href) ? "page" : undefined} onClick={() => setMenuOpen(false)}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
              <Icon size={17} /> {label}
            </Link>
          ))}
        </div>
      ))}
      <div className="dash-nav-foot">
        {email && <span className="dash-email">{email}</span>}
        {!demo && (
          <form action="/auth/logout" method="POST">
            <button type="submit" className="dash-nav-link dash-logout"><LogOut size={17} /> Cerrar sesión</button>
          </form>
        )}
      </div>
    </>
  );

  return (
    <div className="dash-shell" style={brandStyle(business.brandColor)}>
      {demo && (
        <div className="demo-ribbon" role="status">
          <span className="demo-dot" />
          <span>MODO DEMO · Datos de ejemplo. Los cambios no se guardan.</span>
        </div>
      )}
      <div className="dash-body">
        <nav className="dash-side" aria-label="Panel">{nav}</nav>

        <div className="dash-content">
          {notice && (
            <div className={`panel-notice${notice.tone === "warning" ? " warning" : ""}`} role="status">
              <span>{notice.message}</span>
              <Link href="/dashboard/plan" className="header-action-btn">Ver mi plan</Link>
            </div>
          )}
          {pendingOnboarding && (
            <div className="panel-notice">
              <span>Tienes un negocio con la configuración pendiente.</span>
              <Link href="/onboarding" className="header-action-btn">Continuar configuración</Link>
            </div>
          )}
          {children}
        </div>
      </div>

      {/* Celular: barra inferior + menú completo */}
      <nav className="dash-tabs" aria-label="Navegación">
        <Link href="/dashboard" className={`dash-tab${isActive("/dashboard") ? " active" : ""}`}>
          <CalendarDays size={20} /> Agenda
        </Link>
        {manager && (
          <Link href="/dashboard/equipo" className={`dash-tab${pathname.startsWith("/dashboard/") && !isActive("/dashboard/plan") ? " active" : ""}`}>
            <LayoutGrid size={20} /> Mi negocio
          </Link>
        )}
        {manager && (
          <Link href="/dashboard/plan" className={`dash-tab${isActive("/dashboard/plan") ? " active" : ""}`}>
            <CreditCard size={20} /> Mi plan
          </Link>
        )}
        <button type="button" className="dash-tab" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen}>
          <Menu size={20} /> Menú
        </button>
      </nav>
      {menuOpen && (
        <div className="dash-drawer" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" className="dash-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
          {nav}
        </div>
      )}
    </div>
  );
}
