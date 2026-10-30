import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/admin-console";
import { requireUser } from "@/lib/auth";
import { getAdminPaymentRequests, getAdminSnapshot, isPlatformAdmin } from "@/lib/billing-server";
import { EMAIL_STATUS } from "@/lib/email";
import { PUSH_STATUS } from "@/lib/push";
import { CAPTCHA_MODE } from "@/lib/turnstile";
import { DEMO_MODE } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plataforma | AuraBook",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  let email = "";
  if (!DEMO_MODE) {
    const user = await requireUser("/admin");
    // 404 para no revelar que la ruta existe a usuarios sin permiso.
    if (!(await isPlatformAdmin())) notFound();
    email = user.email ?? "";
  }
  const [data, requests] = await Promise.all([getAdminSnapshot(), getAdminPaymentRequests()]);
  return <AdminConsole data={data} demo={DEMO_MODE} email={email} requests={requests} emailStatus={{ ...EMAIL_STATUS, captcha: CAPTCHA_MODE, push: PUSH_STATUS }} />;
}
