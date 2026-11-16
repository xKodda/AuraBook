"use client";

import { useState, useTransition } from "react";
import { setFounderPublicAction } from "@/app/dashboard/plan/actions";

/** Casilla «Aparecer en el muro de fundadores» (/fundadores). Se guarda al marcarla. */
export function FounderWallToggle({ initial }: { initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (value: boolean) => {
    setChecked(value);
    setError(null);
    startTransition(async () => {
      const result = await setFounderPublicAction(value);
      if (!result.ok) {
        setChecked(!value);
        setError(result.error);
      }
    });
  };

  return (
    <>
      <label className="onb-check small">
        <input type="checkbox" checked={checked} disabled={pending} onChange={(e) => change(e.target.checked)} />
        <span>Mostrar mi negocio en el muro de fundadores de aurabook.cl</span>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}
