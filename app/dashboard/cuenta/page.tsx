import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountManager } from "@/components/manage/account-manager";
import { getDashboardContext } from "@/lib/dashboard";

export const metadata: Metadata = { title: "Mi cuenta | AuraBook", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/dashboard");
  const { business, session } = ctx;
  return (
    <AccountManager
      key={business.id}
      email={session.email ?? "modo demo"}
      business={{ id: business.id, name: business.name, slug: business.slug, role: business.role }}
      lastBusiness={session.businesses.length === 1}
    />
  );
}
