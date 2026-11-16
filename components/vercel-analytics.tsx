"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Vercel Web Analytics y Speed Insights (sin cookies). Antes de enviar cada evento se limpia la URL: el token de
 * /reserva/<token> da acceso a la reserva de un cliente y no debe quedar guardado en Vercel; los parámetros (?…) se
 * descartan.
 */
function clean<T extends { url: string }>(event: T): T {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/^\/reserva\/[^/]+/, "/reserva/[token]");
  return { ...event, url: url.toString() };
}

export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={clean} />
      <SpeedInsights beforeSend={clean} />
    </>
  );
}
