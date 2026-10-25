"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import type { ScheduleDay } from "@/lib/types";

const SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** «lun a sáb», «lun, mié y vie» o «Sin horario». */
export function scheduleSummary(days: ScheduleDay[] | undefined): string {
  if (!days?.length) return "Sin horario";
  const on = ORDER.filter((d) => days.some((x) => x.weekday === d));
  const idx = on.map((d) => ORDER.indexOf(d));
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (on.length === 7) return "Todos los días";
  if (consecutive && on.length > 2) return `${SHORT[on[0]]} a ${SHORT[on[on.length - 1]]}`;
  const names = on.map((d) => SHORT[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function PageHead({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="dash-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="dash-head-actions">{children}</div>}
    </div>
  );
}

/** Confirmación breve de guardado, que desaparece sola. */
export function Saved({ message }: { message: string | null }) {
  const [shown, setShown] = useState(message);
  useEffect(() => {
    setShown(message);
    if (!message) return;
    const t = setTimeout(() => setShown(null), 4000);
    return () => clearTimeout(t);
  }, [message]);
  if (!shown) return null;
  return <div className="dash-saved" role="status"><CheckCircle2 size={16} /> {shown}</div>;
}
