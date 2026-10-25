import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/redirects";
import { sessionDb } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change", "magiclink"];

/**
 * Destino de los enlaces de correo (confirmación de cuenta y recuperación de contraseña).
 * - `token_hash` + `type`: plantillas personalizadas; funciona aunque el correo se abra en otro dispositivo.
 * - `code`: plantillas por defecto (PKCE); solo funciona en el mismo navegador donde se pidió el correo.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const next = safeNextPath(params.get("next"), "/dashboard");

  const supabase = await sessionDb();
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("verifyOtp:", error.code, error.message);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("exchangeCodeForSession:", error.code, error.message);
  }

  return NextResponse.redirect(new URL("/login?error=link_invalid", request.url));
}
