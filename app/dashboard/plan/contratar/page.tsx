import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/manage/common";
import { PremiumCheckout } from "@/components/premium-checkout";
import { getPendingPaymentRequest, getPublicPlans } from "@/lib/billing-server";
import { requireManager } from "@/lib/dashboard";
import { BANK_TRANSFER } from "@/lib/env";

export const metadata: Metadata = { title: "Contratar Premium | AuraBook", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const { business } = await requireManager();
  const [plans, pending] = await Promise.all([getPublicPlans(), getPendingPaymentRequest(business.id)]);
  const premium = plans.plans.find((p) => p.code === "premium");
  if (!premium) notFound();
  return (
    <main className="dash-page">
      <PageHead title="Contratar Premium" subtitle="Más equipo, tu marca, estadísticas y control de ausencias." />
      <PremiumCheckout premium={premium} staffCount={business.entitlements.staffCount} pending={pending}
        bank={BANK_TRANSFER} businessName={business.name} />
    </main>
  );
}
