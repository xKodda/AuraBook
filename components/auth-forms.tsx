"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Sparkles } from "lucide-react";
import {
  requestPasswordResetAction,
  resendConfirmationAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  type AuthFormState,
} from "@/app/auth/actions";

const IDLE: AuthFormState = { status: "idle" };

function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="auth-header">
      <Link href="/" className="brand-symbol auth-symbol" aria-label="AuraBook, inicio">
        <Sparkles size={22} strokeWidth={2.3} />
      </Link>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function DemoNotice({ demo }: { demo: boolean }) {
  if (!demo) return null;
  return (
    <div className="auth-notice">
      <strong>Modo demo:</strong> no hay cuentas reales. Puedes ver el{" "}
      <Link href="/dashboard">panel de demostración</Link>.
    </div>
  );
}

function SentState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="auth-sent" role="status">
      <span className="auth-sent-icon"><CheckCircle2 size={28} /></span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

function EmailField({ defaultValue }: { defaultValue?: string }) {
  return (
    <label className="auth-field">
      <span className="field-label">Correo electrónico</span>
      <input
        type="email" name="email" required autoComplete="email" inputMode="email"
        placeholder="contacto@minegocio.cl" className="text-input" defaultValue={defaultValue}
      />
    </label>
  );
}

function PasswordField({ name = "password", label = "Contraseña", autoComplete, hint }: {
  name?: string; label?: string; autoComplete: string; hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span className="field-label">{label}</span>
      <span className="password-wrap">
        <input
          type={visible ? "text" : "password"} name={name} required minLength={8} maxLength={72}
          autoComplete={autoComplete} className="text-input"
        />
        <button
          type="button" className="password-toggle" onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="submit-button">
      {pending ? "Procesando…" : children} {!pending && <ArrowRight size={16} />}
    </button>
  );
}

function ResendConfirmation({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendConfirmationAction, IDLE);
  if (state.status === "sent") return <p className="auth-inline-ok">Te enviamos un nuevo enlace a {email}.</p>;
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <button type="submit" className="btn-secondary auth-wide" disabled={pending}>
        {pending ? "Enviando…" : "Reenviar correo de verificación"}
      </button>
    </form>
  );
}

export function SignUpForm({ demo }: { demo: boolean }) {
  const [state, action, pending] = useActionState(signUpAction, IDLE);
  if (state.status === "sent") {
    return (
      <div className="auth-card">
        <SentState
          title="Revisa tu correo"
          action={<ResendConfirmation email={state.email ?? ""} />}
        >
          Enviamos un enlace de confirmación a <strong>{state.email}</strong>. Ábrelo para activar tu cuenta y
          configurar tu negocio. Si no llega en unos minutos, revisa la carpeta de spam.
        </SentState>
      </div>
    );
  }
  return (
    <div className="auth-card">
      <AuthHeader title="Crea tu cuenta" subtitle="Configura tu negocio y recibe reservas online en minutos." />
      <DemoNotice demo={demo} />
      <form action={action} className="auth-form">
        <EmailField />
        <PasswordField autoComplete="new-password" hint="Mínimo 8 caracteres." />
        <label className="auth-terms">
          <input type="checkbox" name="terms" required />
          <span>
            Acepto los <Link href="/terminos" target="_blank">Términos y Condiciones</Link>, la{" "}
            <Link href="/privacidad" target="_blank">Política de Privacidad</Link> y el{" "}
            <Link href="/tratamiento-datos" target="_blank">Acuerdo de Tratamiento de Datos</Link>.
          </span>
        </label>
        {state.status === "error" && <div className="form-error">{state.message}</div>}
        <Submit pending={pending}>Crear cuenta</Submit>
      </form>
      <p className="auth-switch">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p>
    </div>
  );
}

export function LoginForm({ demo, next, linkError }: { demo: boolean; next: string; linkError: boolean }) {
  const [state, action, pending] = useActionState(signInAction, IDLE);
  return (
    <div className="auth-card">
      <AuthHeader title="Ingresa a tu panel" subtitle="Administra tu agenda, equipo y servicios." />
      <DemoNotice demo={demo} />
      {linkError && state.status === "idle" && (
        <div className="form-error">El enlace expiró o ya fue usado. Inicia sesión o solicita uno nuevo.</div>
      )}
      <form action={action} className="auth-form">
        <input type="hidden" name="next" value={next} />
        <EmailField key={state.email} defaultValue={state.email} />
        <PasswordField autoComplete="current-password" />
        <Link href="/recuperar" className="auth-forgot">¿Olvidaste tu contraseña?</Link>
        {state.status === "error" && <div className="form-error">{state.message}</div>}
        <Submit pending={pending}>Ingresar</Submit>
      </form>
      {state.code === "email_not_confirmed" && state.email && <ResendConfirmation email={state.email} />}
      <p className="auth-switch">¿Aún no tienes cuenta? <Link href="/registro">Crea tu cuenta</Link></p>
    </div>
  );
}

export function ResetRequestForm({ demo }: { demo: boolean }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, IDLE);
  if (state.status === "sent") {
    return (
      <div className="auth-card">
        <SentState
          title="Revisa tu correo"
          action={<Link href="/login" className="btn-secondary auth-wide">Volver a iniciar sesión</Link>}
        >
          Si existe una cuenta con <strong>{state.email}</strong>, recibirás un enlace para crear una nueva contraseña.
        </SentState>
      </div>
    );
  }
  return (
    <div className="auth-card">
      <AuthHeader title="Recupera tu acceso" subtitle="Te enviaremos un enlace para crear una nueva contraseña." />
      <DemoNotice demo={demo} />
      <form action={action} className="auth-form">
        <EmailField />
        {state.status === "error" && <div className="form-error">{state.message}</div>}
        <Submit pending={pending}>Enviar enlace</Submit>
      </form>
      <p className="auth-switch"><Link href="/login">Volver a iniciar sesión</Link></p>
    </div>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, IDLE);
  return (
    <div className="auth-card">
      <AuthHeader title="Nueva contraseña" subtitle="Elige una contraseña que no uses en otros sitios." />
      <form action={action} className="auth-form">
        <PasswordField autoComplete="new-password" label="Nueva contraseña" hint="Mínimo 8 caracteres." />
        <PasswordField name="confirm" autoComplete="new-password" label="Repite la contraseña" />
        {state.status === "error" && <div className="form-error">{state.message}</div>}
        <Submit pending={pending}>Guardar contraseña</Submit>
      </form>
    </div>
  );
}
