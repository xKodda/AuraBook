import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export async function proxy(request: NextRequest) {
  if (DEMO_MODE || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Rutas con sesión: el proxy solo refresca la cookie; cada página valida el usuario en el servidor.
  matcher: [
    "/dashboard/:path*", "/onboarding/:path*", "/admin/:path*", "/panel/:path*", "/auth/:path*",
    "/login", "/registro", "/cuenta/:path*",
  ],
};
