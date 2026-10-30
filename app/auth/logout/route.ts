import { NextRequest, NextResponse } from "next/server";
import { sessionDb } from "@/lib/supabase";
import { safeError } from "@/lib/log-safe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await sessionDb();
    await supabase.auth.signOut();
  } catch (error) {
    console.error("SignOut error:", safeError(error));
  }
  // 303: el navegador sigue con GET; un 307 reenviaría el POST a la página de login.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
