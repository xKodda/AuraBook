"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (sin cookies). Antes de enviar cada visita se limpia la URL: el token de /reserva/<token> da
 * acceso a la reserva de un cliente y no debe quedar guardado en Analytics; los parámetros (?…) se descartan.
 */
function clean(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/^\/reserva\/[^/]+/, "/reserva/[token]");
  return { ...event, url: url.toString() };
}

export function VercelAnalytics() {
  return <Analytics beforeSend={clean} />;
}
