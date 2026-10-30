"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const pad = (n: number) => String(n).padStart(2, "0");

/** Cuenta regresiva a pantalla completa para grabar el lanzamiento. ?prueba=15 la hace terminar en 15 s. */
export function LaunchCountdown({ target }: { target: string }) {
  const [end, setEnd] = useState(() => new Date(target).getTime());
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const test = Number(new URLSearchParams(window.location.search).get("prueba"));
    if (test > 0) setEnd(Date.now() + test * 1000);
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  const left = now === null ? null : Math.max(0, Math.ceil((end - now) / 1000));
  const live = left === 0;
  const h = left === null ? 0 : Math.floor(left / 3600);
  const m = left === null ? 0 : Math.floor((left % 3600) / 60);
  const s = left === null ? 0 : left % 60;

  return (
    <main className="launch" onDoubleClick={toggleFullscreen} data-live={live || undefined}>
      <div className="launch-brand">
        <img src="/brand/aurabook-isotipo-blanco.svg" alt="" width={44} height={44} />
        <span>AURABOOK</span>
      </div>

      {live ? (
        <div className="launch-live">
          <p className="launch-kicker">Viernes 30 de octubre</p>
          <h1>¡Ya estamos en vivo!</h1>
          <Link href="/" className="launch-cta">Entrar a AuraBook</Link>
        </div>
      ) : (
        <div className="launch-body">
          <p className="launch-kicker">Lanzamos en</p>
          <div className="launch-clock" aria-live="off" style={{ visibility: left === null ? "hidden" : undefined }}>
            <span className="launch-unit"><b>{pad(h)}</b><small>horas</small></span>
            <span className="launch-sep">:</span>
            <span className="launch-unit"><b>{pad(m)}</b><small>min</small></span>
            <span className="launch-sep">:</span>
            <span className="launch-unit"><b>{pad(s)}</b><small>seg</small></span>
          </div>
          <p className="launch-date">Viernes 30 · 00:00</p>
        </div>
      )}
    </main>
  );
}
