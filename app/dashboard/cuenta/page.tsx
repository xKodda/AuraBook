import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountManager } from "@/components/manage/account-manager";
import { PushToggle } from "@/components/push-toggle";
import { getDashboardContext } from "@/lib/dashboard";
import { VAPID_PUBLIC_KEY } from "@/lib/env";
import { PUSH_STATUS } from "@/lib/push";

export const metadata: Metadata = { title: "Mi cuenta | AuraBook", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/dashboard");
  const { business, session } = ctx;
  return (
    <>
      {PUSH_STATUS.configured && business.role !== "staff" && <PushToggle publicKey={VAPID_PUBLIC_KEY} variant="card" />}
      <AccountManager
        key={business.id}
        email={session.email ?? "modo demo"}
        business={{ id: business.id, name: business.name, slug: business.slug, role: business.role }}
        lastBusiness={session.businesses.length === 1}
      />
    </>
  );
}
