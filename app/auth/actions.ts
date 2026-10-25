"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { siteOrigin } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/redirects";
import { sessionDb } from "@/lib/supabase";
import { emailSchema } from "@/lib/validation";

export type AuthFormState = {
  status: "idle" | "error" | "sent";
  message?: string;
  /** `email_not_confirmed` permite ofrecer el reenvío del correo de verificación. */
  code?: "email_not_confirmed";
  email?: string;
};

const passwordSchema = z.string().min(8).max(72);
const DEMO_ERROR: AuthFormState = {
  status: "error",
  message: "El modo demo no tiene cuentas reales. Configura Supabase para usar el registro.",
};
const RATE_LIMITED: AuthFormState = { status: "error", message: "Demasiados intentos. Espera unos minutos." };

async function allowed(action: string, limit: number): Promise<boolean> {
  return rateLimit(`${action}:ip:${clientIp(await headers())}`, limit, 600);
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (DEMO_MODE) return DEMO_ERROR;
  if (!(await allowed("signup", 5))) return RATE_LIMITED;

  const email = emailSchema.safeParse(field(formData, "email").toLowerCase());
  const password = passwordSchema.safeParse(String(formData.get("password") ?? ""));
  if (!email.success) return { status: "error", message: "Ingresa un correo electrónico válido." };
  if (!password.success) return { status: "error", message: "La contraseña debe tener al menos 8 caracteres." };

  const db = await sessionDb();
  const { error } = await db.auth.signUp({
    email: email.data,
    password: password.data,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/onboarding` },
  });
  if (error) {
    console.error("signUp:", error.code, error.message);
    if (error.code === "weak_password") {
      return { status: "error", message: "Esa contraseña es muy débil o conocida. Elige otra." };
    }
    if (error.code === "over_email_send_rate_limit") return RATE_LIMITED;
    return { status: "error", message: "No pudimos crear la cuenta. Intenta nuevamente." };
  }
  // Si el correo ya existía, Supabase responde igual (no revela qué correos tienen cuenta).
  return { status: "sent", email: email.data };
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (DEMO_MODE) return DEMO_ERROR;
  if (!(await allowed("login", 10))) return RATE_LIMITED;

  const email = emailSchema.safeParse(field(formData, "email").toLowerCase());
  const password = String(formData.get("password") ?? "");
  if (!email.success || !password) return { status: "error", message: "Ingresa tu correo y contraseña." };

  const db = await sessionDb();
  const { error } = await db.auth.signInWithPassword({ email: email.data, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        status: "error", code: "email_not_confirmed", email: email.data,
        message: "Aún no confirmas tu correo. Revisa tu bandeja de entrada o pide un nuevo enlace.",
      };
    }
    return { status: "error", message: "Correo o contraseña incorrectos.", email: email.data };
  }
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/dashboard"));
}

export async function resendConfirmationAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (DEMO_MODE) return DEMO_ERROR;
  if (!(await allowed("resend", 3))) return RATE_LIMITED;
  const email = emailSchema.safeParse(field(formData, "email").toLowerCase());
  if (!email.success) return { status: "error", message: "Ingresa un correo electrónico válido." };
  const db = await sessionDb();
  const { error } = await db.auth.resend({
    type: "signup",
    email: email.data,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/onboarding` },
  });
  if (error) console.error("resend:", error.code, error.message);
  return { status: "sent", email: email.data };
}

export async function requestPasswordResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (DEMO_MODE) return DEMO_ERROR;
  if (!(await allowed("reset", 3))) return RATE_LIMITED;
  const email = emailSchema.safeParse(field(formData, "email").toLowerCase());
  if (!email.success) return { status: "error", message: "Ingresa un correo electrónico válido." };
  const db = await sessionDb();
  const { error } = await db.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/cuenta/nueva-clave`,
  });
  if (error) console.error("resetPasswordForEmail:", error.code, error.message);
  // Respuesta idéntica exista o no la cuenta.
  return { status: "sent", email: email.data };
}

export async function updatePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (DEMO_MODE) return DEMO_ERROR;
  const password = passwordSchema.safeParse(String(formData.get("password") ?? ""));
  if (!password.success) return { status: "error", message: "La contraseña debe tener al menos 8 caracteres." };
  if (formData.get("password") !== formData.get("confirm")) {
    return { status: "error", message: "Las contraseñas no coinciden." };
  }
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { status: "error", message: "El enlace expiró. Solicita uno nuevo." };
  const { error } = await db.auth.updateUser({ password: password.data });
  if (error) {
    console.error("updateUser:", error.code, error.message);
    return {
      status: "error",
      message: error.code === "same_password"
        ? "La nueva contraseña debe ser distinta de la anterior."
        : "No pudimos actualizar la contraseña. Intenta nuevamente.",
    };
  }
  redirect("/dashboard");
}
