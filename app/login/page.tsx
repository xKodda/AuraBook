import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/env";
import { safeNextPath } from "@/lib/redirects";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Iniciar sesión | AuraBook",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const target = safeNextPath(next, "/dashboard");
  if (!DEMO_MODE && (await currentUser())) redirect(target);
  return (
    <div className="auth-shell">
      <LoginForm demo={DEMO_MODE} next={target} linkError={error === "link_invalid"} />
    </div>
  );
}
