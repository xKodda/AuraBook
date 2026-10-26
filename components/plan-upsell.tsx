import Link from "next/link";
import { Sparkles } from "lucide-react";
import { FEATURES, type FeatureKey } from "@/lib/plans";

/** Aviso en lugar de una función que el plan no incluye. Quien no administra el negocio solo ve el aviso. */
export function PlanUpsell({ feature, canManage }: { feature: FeatureKey; canManage: boolean }) {
  const info = FEATURES[feature];
  return (
    <section className="plan-upsell">
      <span className="plan-upsell-icon"><Sparkles size={18} /></span>
      <div>
        <strong>{info.label} · Premium</strong>
        <p>{info.description}</p>
      </div>
      {canManage && <Link href="/dashboard/plan" className="btn-secondary dash-btn-sm">Ver Premium</Link>}
    </section>
  );
}
