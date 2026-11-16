"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

type NavLink = { href: string; label: string };

/** Menú del encabezado en el celular. Se cierra al elegir un enlace, al cambiar de página, con Escape o al tocar fuera. */
export function SiteMenu({ links }: { links: NavLink[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const close = () => ref.current?.removeAttribute("open");

  useEffect(close, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);

  return (
    <details ref={ref} className="lp-menu">
      <summary aria-label="Menú">
        <Menu size={22} className="lp-menu-open" aria-hidden="true" />
        <X size={22} className="lp-menu-close" aria-hidden="true" />
      </summary>
      <nav className="lp-menu-panel" aria-label="Menú" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) close(); }}>
        {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        <Link href="/login" className="btn-secondary lp-menu-login">Ingresar</Link>
      </nav>
    </details>
  );
}
