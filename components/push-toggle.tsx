"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { deletePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/app/dashboard/push-actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "dismissed";

const DISMISS_KEY = "aurabook:push-dismissed";

/** La clave pública VAPID viene en base64url; el navegador la necesita en bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// En iPhone/iPad el push web solo existe con AuraBook agregado a la pantalla de inicio (iOS 16.4 o superior).
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Activa los avisos de reservas en este navegador. `banner` (agenda): se oculta si ya están activos o si el usuario
 * eligió «Ahora no». `card` (Mi cuenta): siempre visible, con opción de probar y desactivar.
 */
export function PushToggle({ publicKey, variant }: { publicKey: string; variant: "banner" | "card" }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: State;
      if (!supported) next = isIos() && !isStandalone() ? "ios-install" : "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        // Se vuelve a guardar en cada visita: si el servidor la había borrado, este navegador sigue recibiendo avisos.
        if (sub && Notification.permission === "granted") {
          await savePushSubscriptionAction(sub.toJSON());
          next = "on";
        } else next = "off";
      }
      if (variant === "banner" && (next === "off" || next === "ios-install") && readDismissed()) next = "dismissed";
      if (!cancelled) setState(next);
    })().catch(() => { if (!cancelled) setState("unsupported"); });
    return () => { cancelled = true; };
  }, [variant]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const json = sub.toJSON();
      const saved = await savePushSubscriptionAction(json);
      if (!saved.ok) {
        await sub.unsubscribe();
        setMessage({ ok: false, text: saved.error });
        return;
      }
      setState("on");
      const test = await sendTestPushAction(json);
      setMessage(test.ok
        ? { ok: true, text: "¡Listo! Te enviamos un aviso de prueba." }
        : { ok: false, text: test.error });
    } catch {
      setMessage({ ok: false, text: "Este navegador no permitió activar los avisos. Intenta nuevamente." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      const res = sub ? await sendTestPushAction(sub.toJSON()) : { ok: false as const, error: "Activa los avisos primero." };
      setMessage(res.ok ? { ok: true, text: "Aviso de prueba enviado." } : { ok: false, text: res.error });
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Sin almacenamiento (modo privado): se oculta solo por esta visita.
    }
    setState("dismissed");
  }

  if (state === "loading" || state === "dismissed") return null;
  if (variant === "banner" && (state === "on" || state === "unsupported" || state === "denied")) return null;

  const copy: Record<Exclude<State, "loading" | "dismissed">, { title: string; text: string }> = {
    off: { title: "Avisos en este teléfono", text: "Recibe una notificación apenas alguien reserve o cancele, aunque tengas AuraBook cerrado." },
    on: { title: "Avisos activos en este navegador", text: "Te avisamos aquí de cada reserva y cancelación desde tu página." },
    "ios-install": {
      title: "Avisos en tu iPhone",
      text: "Toca Compartir y luego «Agregar a pantalla de inicio». Abre AuraBook desde ese ícono y activa los avisos aquí (iOS 16.4 o superior).",
    },
    denied: { title: "Avisos bloqueados", text: "Bloqueaste las notificaciones de AuraBook en este navegador. Puedes permitirlas en los ajustes del navegador o del teléfono." },
    unsupported: { title: "Avisos no disponibles", text: "Este navegador no admite notificaciones. Prueba con Chrome en Android o con Safari en iPhone." },
  };
  const { title, text } = copy[state];

  return (
    <section className="plan-upsell push-toggle" aria-live="polite">
      <span className="plan-upsell-icon"><BellRing size={18} /></span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
        {message && <p className={message.ok ? "push-ok" : "push-error"}>{message.text}</p>}
      </div>
      <div className="push-actions">
        {state === "off" && (
          <button type="button" className="btn-primary dash-btn-sm" onClick={enable} disabled={busy}>
            {busy ? "Activando…" : "Activar avisos"}
          </button>
        )}
        {state === "on" && (
          <>
            <button type="button" className="btn-secondary dash-btn-sm" onClick={test} disabled={busy}>Probar</button>
            <button type="button" className="btn-secondary dash-btn-sm" onClick={disable} disabled={busy}>Desactivar</button>
          </>
        )}
        {variant === "banner" && (state === "off" || state === "ios-install") && (
          <button type="button" className="btn-secondary dash-btn-sm" onClick={dismiss} disabled={busy}>Ahora no</button>
        )}
      </div>
    </section>
  );
}
