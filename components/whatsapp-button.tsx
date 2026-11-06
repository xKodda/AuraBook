"use client";

import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/company";

// Panel interno y páginas con la marca de cada negocio: ahí el botón de AuraBook sobra.
const HIDDEN_PREFIXES = ["/dashboard", "/panel", "/admin", "/onboarding", "/cuenta", "/reservar", "/reserva"];

/** Botón flotante para escribirle al equipo por WhatsApp (sitio comercial, legales y acceso). */
export function WhatsAppButton() {
  const pathname = usePathname() ?? "/";
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return (
    <a href={whatsappUrl()} target="_blank" rel="noopener" className="wa-float"
      aria-label="¿Dudas? Escríbenos por WhatsApp (se abre en una pestaña nueva)">
      <MessageCircle size={22} aria-hidden="true" />
      <span>¿Dudas? Escríbenos</span>
    </a>
  );
}
