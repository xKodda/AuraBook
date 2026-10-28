"use client";

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Circle, Copy, ExternalLink, LogOut,
  Pencil, Plus, Rocket, Scissors, Store, Trash2, Users,
} from "lucide-react";
import {
  archiveServiceAction, archiveStaffAction, checkSlugAction, createBusinessAction, publishBusinessAction,
  removeLogoAction, saveScheduleAction, saveServiceAction, saveStaffAction, setBrandColorAction,
  updateBusinessAction, uploadLogoAction, type OnboardingResult,
} from "@/app/onboarding/actions";
import { BrandMark } from "@/components/brand";
import {
  ChoiceField, DURATIONS, WeekRows, formatDuration, rowsInvalid, rowsToDays, toRows, type DayRow,
} from "@/components/business-editors";
import { LogoPicker } from "@/components/logo-picker";
import { formatPrice } from "@/lib/dates";
import { BRAND_COLORS, ROLE_TITLES, SERVICE_PRESETS, TAGLINES } from "@/lib/presets";
import { isValidSlug, slugify } from "@/lib/slug";
import { CATEGORY_COPY, CATEGORY_LABEL } from "@/lib/theme";
import type {
  BusinessCategory, OnboardingService, OnboardingStaff, OnboardingState,
} from "@/lib/types";

type Props = { initial: OnboardingState; userEmail: string; siteUrl: string };

const STEPS = [
  { label: "Negocio", icon: Store },
  { label: "Equipo", icon: Users },
  { label: "Horarios", icon: CalendarDays },
  { label: "Servicios", icon: Scissors },
  { label: "Publicar", icon: Rocket },
] as const;

const CATEGORIES = Object.keys(CATEGORY_LABEL) as BusinessCategory[];

const hasSchedule = (state: OnboardingState, staffId: string) => (state.schedules[staffId]?.length ?? 0) > 0;

/** Primer paso con algo pendiente; también es el paso más lejano al que se puede saltar. */
function firstIncompleteStep(state: OnboardingState): number {
  if (!state.business) return 0;
  if (state.staff.length === 0) return 1;
  if (!state.staff.some((s) => hasSchedule(state, s.id))) return 2;
  if (state.services.length === 0) return 3;
  return 4;
}

// ─────────────────────────────────────────────────────────────
// Asistente
// ─────────────────────────────────────────────────────────────
export function OnboardingWizard({ initial, userEmail, siteUrl }: Props) {
  const [state, setState] = useState(initial);
  const [step, setStep] = useState(() => (initial.business?.published ? 4 : firstIncompleteStep(initial)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState(siteUrl);

  useEffect(() => {
    if (!siteUrl) setOrigin(window.location.origin);
  }, [siteUrl]);

  const reachable = state.business?.published ? 4 : firstIncompleteStep(state);

  function goTo(next: number) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Ejecuta una acción del servidor; si va bien, reemplaza el estado y llama a `onOk`. */
  function run(action: () => Promise<OnboardingResult>, onOk?: (next: OnboardingState) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setState(result.state);
        onOk?.(result.state);
      } catch {
        setError("Se perdió la conexión. Revisa tu internet e intenta nuevamente.");
      }
    });
  }

  const shared = { state, run, pending, error, goTo };

  return (
    <div className="onb-shell">
      <header className="onb-header">
        <BrandMark suffix="CONFIGURACIÓN" />
        <div className="onb-header-user">
          <span className="panel-user-email">{userEmail}</span>
          <form action="/auth/logout" method="POST">
            <button type="submit" className="panel-logout-btn" title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut size={14} />
            </button>
          </form>
        </div>
      </header>

      <main className="onb-main">
        <nav className="onb-stepper" aria-label="Pasos de configuración">
          {STEPS.map(({ label, icon: Icon }, i) => {
            const done = i < reachable || (i === 4 && state.business?.published);
            return (
              <button
                key={label}
                type="button"
                className={`onb-step${i === step ? " current" : ""}${done ? " done" : ""}`}
                disabled={i > reachable || pending}
                onClick={() => goTo(i)}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="onb-step-dot">{done && i !== step ? <Check size={14} /> : <Icon size={14} />}</span>
                <span className="onb-step-label">{label}</span>
              </button>
            );
          })}
        </nav>

        <section className="onb-card">
          {step === 0 && <BusinessStep {...shared} origin={origin} />}
          {step === 1 && <TeamStep {...shared} />}
          {step === 2 && <ScheduleStep {...shared} />}
          {step === 3 && <ServicesStep {...shared} />}
          {step === 4 && <PublishStep {...shared} origin={origin} />}
        </section>
      </main>
    </div>
  );
}

type StepProps = {
  state: OnboardingState;
  run: (action: () => Promise<OnboardingResult>, onOk?: (next: OnboardingState) => void) => void;
  pending: boolean;
  error: string | null;
  goTo: (step: number) => void;
};

function StepHeading({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="onb-heading">
      <span className="label-overline">{kicker}</span>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}

function StepFooter({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="onb-footer">
      {onBack ? (
        <button type="button" className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Atrás
        </button>
      ) : <span />}
      {children}
    </div>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="form-error" role="alert">{error}</div> : null;
}

// ─────────────────────────────────────────────────────────────
// 1. Negocio
// ─────────────────────────────────────────────────────────────
function BusinessStep({ state, run, pending, error, goTo, origin }: StepProps & { origin: string }) {
  const b = state.business;
  const [name, setName] = useState(b?.name ?? "");
  const [category, setCategory] = useState<BusinessCategory>(b?.category ?? "barberia");
  const [slugInput, setSlugInput] = useState<string | null>(null);
  const [tagline, setTagline] = useState(b?.tagline ?? "");
  const [description, setDescription] = useState(b?.description ?? "");
  const [address, setAddress] = useState(b?.address ?? "");
  const [phone, setPhone] = useState(b?.phone ?? "");
  const [brandColor, setBrandColor] = useState((b?.brandColor ?? BRAND_COLORS[0].hex).toUpperCase());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const slug = b ? b.slug : (slugInput ?? slugify(name));
  const slugValid = isValidSlug(slug);

  useEffect(() => {
    if (b || !slugValid) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      const available = await checkSlugAction(slug).catch(() => null);
      setSlugStatus(available === null ? "idle" : available ? "available" : "taken");
    }, 450);
    return () => clearTimeout(timer);
  }, [b, slug, slugValid]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const profile = { name, category, tagline, description, address, phone };
    run(async () => {
      // Datos → color → logo, en orden: cada paso necesita el negocio ya creado.
      let result = b ? await updateBusinessAction(b.id, profile) : await createBusinessAction({ ...profile, slug });
      const id = result.ok ? result.state.business?.id : undefined;
      if (!result.ok || !id) return result;
      if (brandColor !== result.state.business?.brandColor.toUpperCase()) {
        result = await setBrandColorAction(id, brandColor);
        if (!result.ok) return result;
      }
      if (logoFile) {
        const form = new FormData();
        form.append("logo", logoFile);
        result = await uploadLogoAction(id, form);
      } else if (removeLogo && result.state.business?.logoUrl) {
        result = await removeLogoAction(id);
      }
      return result;
    }, () => {
      setLogoFile(null);
      setRemoveLogo(false);
      goTo(1);
    });
  }

  const host = origin.replace(/^https?:\/\//, "") || "aurabook.cl";

  return (
    <form onSubmit={submit}>
      <StepHeading kicker="Paso 1 de 5" title="Cuéntanos de tu negocio">
        Estos datos aparecerán en tu página de reservas. Podrás cambiarlos después.
      </StepHeading>

      <div className="onb-fields">
        <label className="onb-field">
          <span className="field-label">Nombre del negocio</span>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)}
            required minLength={2} maxLength={120} placeholder="Ej: Barbería Don José" autoFocus={!b} />
        </label>

        <fieldset className="onb-field">
          <legend className="field-label">Rubro</legend>
          <div className="onb-chips">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={`onb-chip${category === c ? " selected" : ""}`}
                aria-pressed={category === c} onClick={() => setCategory(c)}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="onb-field">
          <span className="field-label">Enlace de reservas</span>
          <span className={`onb-slug${b ? " locked" : ""}`}>
            <span className="onb-slug-prefix">{host}/reservar/</span>
            <input value={slug} disabled={!!b} maxLength={60} aria-label="Enlace de reservas"
              onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
          </span>
          <small className="field-hint">
            {b ? "El enlace no se puede cambiar para no romper los enlaces que ya compartiste."
              : !slug ? "Se genera a partir del nombre."
              : !slugValid ? "Solo minúsculas, números y guiones; mínimo 3 caracteres."
              : slugStatus === "checking" ? "Verificando disponibilidad…"
              : slugStatus === "available" ? <span className="onb-ok">✓ Disponible</span>
              : slugStatus === "taken" ? <span className="onb-bad">Ese enlace ya está en uso. Prueba otro.</span>
              : " "}
          </small>
        </label>

        <ChoiceField key={`tagline-${category}`} label="Frase corta" optional options={TAGLINES[category]}
          value={tagline} onChange={setTagline} maxLength={160} placeholder="Escribe tu propia frase" />

        <div className="onb-field">
          <span className="field-label">Tu marca</span>
          <div className="onb-brand">
            <LogoPicker
              name={name || "Tu negocio"}
              brandColor={brandColor}
              currentUrl={removeLogo ? null : (b?.logoUrl ?? null)}
              file={logoFile}
              onFile={(f) => { setLogoFile(f); setRemoveLogo(false); }}
              onRemove={() => { setLogoFile(null); setRemoveLogo(true); }}
            />
            <div className="onb-swatches" role="radiogroup" aria-label="Color de marca">
              {BRAND_COLORS.map((c) => (
                <button key={c.hex} type="button" role="radio" aria-checked={brandColor === c.hex}
                  className={`onb-swatch${brandColor === c.hex ? " selected" : ""}`}
                  style={{ background: c.hex }} title={c.name} aria-label={c.name}
                  onClick={() => setBrandColor(c.hex)}>
                  {brandColor === c.hex && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
          <small className="field-hint">Tu logo se ve en tu página en todos los planes; el color, con Premium (incluido en tu prueba de 30 días). PNG, JPG o WebP.</small>
        </div>

        <label className="onb-field">
          <span className="field-label">Descripción <em className="onb-optional">opcional</em></span>
          <textarea className="text-input onb-textarea" value={description} rows={3} maxLength={600}
            onChange={(e) => setDescription(e.target.value)} placeholder="Qué ofreces, cómo trabajas, qué te distingue." />
        </label>

        <div className="onb-grid-2">
          <label className="onb-field">
            <span className="field-label">Dirección <em className="onb-optional">opcional</em></span>
            <input className="text-input" value={address} onChange={(e) => setAddress(e.target.value)}
              maxLength={200} placeholder="Calle 123, Comuna" autoComplete="street-address" />
          </label>
          <label className="onb-field">
            <span className="field-label">Teléfono / WhatsApp <em className="onb-optional">opcional</em></span>
            <input className="text-input" value={phone} onChange={(e) => setPhone(e.target.value)}
              maxLength={20} placeholder="+56 9 1234 5678" inputMode="tel" autoComplete="tel" />
          </label>
        </div>
      </div>

      <ErrorBox error={error} />
      <StepFooter>
        <button type="submit" className="btn-primary"
          disabled={pending || name.trim().length < 2 || (!b && (!slugValid || slugStatus === "taken"))}>
          {pending ? "Guardando…" : b ? "Guardar y continuar" : "Crear negocio"} <ArrowRight size={16} />
        </button>
      </StepFooter>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. Equipo
// ─────────────────────────────────────────────────────────────
function TeamStep({ state, run, pending, error, goTo }: StepProps) {
  const business = state.business!;
  const copy = CATEGORY_COPY[business.category];
  const [editing, setEditing] = useState<OnboardingStaff | null>(null);
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [linkToMe, setLinkToMe] = useState(false);

  const someoneIsMe = state.staff.some((s) => s.linkedToMe);
  const canLinkMe = !someoneIsMe || editing?.linkedToMe;

  function reset() {
    setEditing(null);
    setName("");
    setRoleTitle("");
    setLinkToMe(false);
  }

  function edit(s: OnboardingStaff) {
    setEditing(s);
    setName(s.name);
    setRoleTitle(s.roleTitle);
    setLinkToMe(s.linkedToMe);
  }

  const save = () => saveStaffAction(business.id, {
    id: editing?.id ?? null, name, roleTitle, linkToMe: Boolean(canLinkMe && linkToMe),
  });
  const hasDraft = name.trim().length >= 2;

  function submit(e: FormEvent) {
    e.preventDefault();
    run(save, reset);
  }

  // Si quedó un nombre escrito sin agregar, se guarda antes de avanzar (no se descarta en silencio).
  function next() {
    if (hasDraft) run(save, () => { reset(); goTo(2); });
    else goTo(2);
  }

  function remove(s: OnboardingStaff) {
    if (!window.confirm(`¿Quitar a ${s.name} del equipo?`)) return;
    run(() => archiveStaffAction(business.id, s.id), () => editing?.id === s.id && reset());
  }

  return (
    <div>
      <StepHeading kicker="Paso 2 de 5" title="¿Quiénes atienden?">
        Agrega a cada persona que recibe clientes. Si trabajas solo, agrégate a ti y marca «Soy yo».
      </StepHeading>

      {state.staff.length > 0 && (
        <ul className="onb-list">
          {state.staff.map((s) => (
            <li key={s.id} className="onb-list-item">
              <span className="staff-avatar onb-avatar">{s.name.charAt(0).toUpperCase()}</span>
              <span className="onb-list-body">
                <strong>{s.name} {s.linkedToMe && <span className="onb-badge">Tú</span>}</strong>
                <small>{s.roleTitle || copy.staffSingular}</small>
              </span>
              <span className="onb-list-actions">
                <button type="button" className="panel-action-btn" onClick={() => edit(s)} aria-label={`Editar a ${s.name}`}>
                  <Pencil size={14} />
                </button>
                <button type="button" className="panel-action-btn" onClick={() => remove(s)} disabled={pending}
                  aria-label={`Quitar a ${s.name}`}>
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="onb-subform">
        <h3>{editing ? `Editar a ${editing.name}` : state.staff.length ? "Agregar otra persona" : "Agrega a la primera persona"}</h3>
        <label className="onb-field">
          <span className="field-label">Nombre</span>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)}
            required minLength={2} maxLength={120} placeholder="Ej: Camila" />
        </label>
        <ChoiceField key={editing?.id ?? "new"} label="Cargo" optional options={ROLE_TITLES[business.category]}
          value={roleTitle} onChange={setRoleTitle} maxLength={60} placeholder={copy.staffSingular} />
        {canLinkMe && (
          <label className="onb-check">
            <input type="checkbox" checked={linkToMe} onChange={(e) => setLinkToMe(e.target.checked)} />
            <span>Soy yo: también atiendo clientes</span>
          </label>
        )}
        <div className="onb-subform-actions">
          {editing && <button type="button" className="btn-secondary" onClick={reset}>Cancelar</button>}
          <button type="submit" className="btn-secondary" disabled={pending || name.trim().length < 2}>
            {editing ? <Check size={16} /> : <Plus size={16} />} {editing ? "Guardar cambios" : "Agregar"}
          </button>
        </div>
      </form>

      <ErrorBox error={error} />
      <StepFooter onBack={() => goTo(0)}>
        <button type="button" className="btn-primary" disabled={pending || (state.staff.length === 0 && !hasDraft)} onClick={next}>
          {hasDraft ? `Agregar a ${name.trim()} y continuar` : "Continuar"} <ArrowRight size={16} />
        </button>
      </StepFooter>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. Horarios
// ─────────────────────────────────────────────────────────────
function ScheduleStep({ state, run, pending, error, goTo }: StepProps) {
  const business = state.business!;
  const [target, setTarget] = useState<"all" | string>("all");
  const sourceStaff = target === "all"
    ? state.staff.find((s) => hasSchedule(state, s.id))?.id
    : target;
  const [rows, setRows] = useState<DayRow[]>(() => toRows(sourceStaff ? state.schedules[sourceStaff] : undefined));
  const [saved, setSaved] = useState(false);

  function changeTarget(next: string) {
    setTarget(next);
    setSaved(false);
    const source = next === "all" ? state.staff.find((s) => hasSchedule(state, s.id))?.id : next;
    setRows(toRows(source ? state.schedules[source] : undefined));
  }

  const invalid = rowsInvalid(rows);

  function submit(e: FormEvent) {
    e.preventDefault();
    const staffIds = target === "all" ? state.staff.map((s) => s.id) : [target];
    run(() => saveScheduleAction(business.id, { staffIds, days: rowsToDays(rows) }), () => {
      setSaved(true);
      if (target === "all") goTo(3);
    });
  }

  return (
    <form onSubmit={submit}>
      <StepHeading kicker="Paso 3 de 5" title="¿Cuándo atiendes?">
        Tus clientes solo podrán reservar dentro de estos horarios. El descanso (por ejemplo, almuerzo) se bloquea solo.
      </StepHeading>

      {state.staff.length > 1 && (
        <div className="onb-field">
          <span className="field-label">Aplicar a</span>
          <div className="onb-chips">
            <button type="button" className={`onb-chip${target === "all" ? " selected" : ""}`}
              aria-pressed={target === "all"} onClick={() => changeTarget("all")}>
              Todo el equipo
            </button>
            {state.staff.map((s) => (
              <button key={s.id} type="button" className={`onb-chip${target === s.id ? " selected" : ""}`}
                aria-pressed={target === s.id} onClick={() => changeTarget(s.id)}>
                {hasSchedule(state, s.id) && <Check size={12} />} {s.name}
              </button>
            ))}
          </div>
          <small className="field-hint">
            {target === "all"
              ? "Se usará el mismo horario para todas las personas. Luego puedes ajustar a cada una."
              : "Este horario reemplaza solo el de esta persona."}
          </small>
        </div>
      )}

      <WeekRows rows={rows} onChange={(next) => { setSaved(false); setRows(next); }} />

      {saved && target !== "all" && <p className="onb-ok onb-saved">✓ Horario guardado.</p>}
      <ErrorBox error={error} />
      <StepFooter onBack={() => goTo(1)}>
        <span className="onb-footer-group">
          {target !== "all" && state.staff.some((s) => hasSchedule(state, s.id)) && (
            <button type="button" className="btn-secondary" onClick={() => goTo(3)} disabled={pending}>
              Continuar
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={pending || invalid}>
            {pending ? "Guardando…" : target === "all" ? "Guardar y continuar" : "Guardar horario"}
            {target === "all" && <ArrowRight size={16} />}
          </button>
        </span>
      </StepFooter>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. Servicios
// ─────────────────────────────────────────────────────────────
function ServicesStep({ state, run, pending, error, goTo }: StepProps) {
  const business = state.business!;
  const allStaffIds = state.staff.map((s) => s.id);
  const [editing, setEditing] = useState<OnboardingService | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState("");
  const [staffIds, setStaffIds] = useState<string[]>(allStaffIds);

  const priceClp = Number(price.replace(/\D/g, "") || "NaN");
  const staffName = (id: string) => state.staff.find((s) => s.id === id)?.name ?? "";

  function reset() {
    setEditing(null);
    setName("");
    setDescription("");
    setDuration(30);
    setPrice("");
    setStaffIds(state.staff.map((s) => s.id));
  }

  function edit(s: OnboardingService) {
    setEditing(s);
    setName(s.name);
    setDescription(s.description);
    setDuration(s.durationMin);
    setPrice(String(s.priceClp));
    setStaffIds(s.staffIds);
  }

  function toggleStaff(id: string) {
    setStaffIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  const save = () => saveServiceAction(business.id, {
    id: editing?.id ?? null, name, description, priceClp, durationMin: duration,
    staffIds: state.staff.length === 1 ? allStaffIds : staffIds,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    run(save, (next) => {
      reset();
      setStaffIds(next.staff.map((s) => s.id));
    });
  }

  function remove(s: OnboardingService) {
    if (!window.confirm(`¿Quitar el servicio «${s.name}»?`)) return;
    run(() => archiveServiceAction(business.id, s.id), () => editing?.id === s.id && reset());
  }

  const canSubmit = name.trim().length >= 2 && Number.isFinite(priceClp)
    && (state.staff.length === 1 || staffIds.length > 0);
  // Algo escrito sin agregar: «Continuar» lo guarda (si está completo) o avisa (si está a medias).
  const hasDraft = !editing && (name.trim() !== "" || price !== "");

  function next() {
    if (!hasDraft) return goTo(4);
    if (canSubmit) run(save, () => { reset(); goTo(4); });
    else window.alert("Completa el servicio que estás agregando (nombre y precio) o bórralo antes de continuar.");
  }

  const presets = SERVICE_PRESETS[business.category]
    .filter((p) => !state.services.some((s) => s.name === p.name && s.id !== editing?.id));

  return (
    <div>
      <StepHeading kicker="Paso 4 de 5" title="¿Qué servicios ofreces?">
        La duración define cuánto tiempo se bloquea en la agenda al reservar.
      </StepHeading>

      {state.services.length > 0 && (
        <ul className="onb-list">
          {state.services.map((s) => (
            <li key={s.id} className="onb-list-item">
              <span className="onb-list-body">
                <strong>{s.name}</strong>
                <small>
                  {formatDuration(s.durationMin)} · {formatPrice(s.priceClp)}
                  {state.staff.length > 1 && ` · ${s.staffIds.map(staffName).filter(Boolean).join(", ") || "Sin profesional"}`}
                </small>
              </span>
              <span className="onb-list-actions">
                <button type="button" className="panel-action-btn" onClick={() => edit(s)} aria-label={`Editar ${s.name}`}>
                  <Pencil size={14} />
                </button>
                <button type="button" className="panel-action-btn" onClick={() => remove(s)} disabled={pending}
                  aria-label={`Quitar ${s.name}`}>
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="onb-subform">
        <h3>{editing ? `Editar «${editing.name}»` : state.services.length ? "Agregar otro servicio" : "Agrega tu primer servicio"}</h3>
        <ChoiceField key={editing?.id ?? `new-${state.services.length}`} label="Servicio"
          options={presets.map((p) => p.name)} value={name} onChange={setName}
          onPick={(v) => { const p = presets.find((x) => x.name === v); if (p && !editing) setDuration(p.durationMin); }}
          maxLength={120} placeholder="Nombre del servicio" />
        <div className="onb-grid-2">
          <label className="onb-field">
            <span className="field-label">Duración</span>
            <select className="text-input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d} value={d}>{formatDuration(d)}</option>)}
            </select>
          </label>
          <label className="onb-field">
            <span className="field-label">Precio (CLP)</span>
            <input className="text-input" value={price} inputMode="numeric" required placeholder="12000"
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
            <small className="field-hint">{Number.isFinite(priceClp) ? formatPrice(priceClp) : " "}</small>
          </label>
        </div>
        <label className="onb-field">
          <span className="field-label">Descripción <em className="onb-optional">opcional</em></span>
          <input className="text-input" value={description} onChange={(e) => setDescription(e.target.value)}
            maxLength={300} placeholder="Qué incluye" />
        </label>
        {state.staff.length > 1 && (
          <fieldset className="onb-field">
            <legend className="field-label">¿Quién lo realiza?</legend>
            <div className="onb-chips">
              {state.staff.map((s) => (
                <button key={s.id} type="button" className={`onb-chip${staffIds.includes(s.id) ? " selected" : ""}`}
                  aria-pressed={staffIds.includes(s.id)} onClick={() => toggleStaff(s.id)}>
                  {staffIds.includes(s.id) && <Check size={12} />} {s.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="onb-subform-actions">
          {editing && <button type="button" className="btn-secondary" onClick={reset}>Cancelar</button>}
          <button type="submit" className="btn-secondary" disabled={pending || !canSubmit}>
            {editing ? <Check size={16} /> : <Plus size={16} />} {editing ? "Guardar cambios" : "Agregar servicio"}
          </button>
        </div>
      </form>

      <ErrorBox error={error} />
      <StepFooter onBack={() => goTo(2)}>
        <button type="button" className="btn-primary" disabled={pending || (state.services.length === 0 && !canSubmit)} onClick={next}>
          {hasDraft && canSubmit ? "Agregar y continuar" : "Continuar"} <ArrowRight size={16} />
        </button>
      </StepFooter>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. Publicar
// ─────────────────────────────────────────────────────────────
function PublishStep({ state, run, pending, error, goTo, origin }: StepProps & { origin: string }) {
  const business = state.business!;
  const [copied, setCopied] = useState(false);
  const url = `${origin}/reservar/${business.slug}`;
  const withoutHours = state.staff.filter((s) => !hasSchedule(state, s.id));
  const scheduled = new Set(state.staff.filter((s) => hasSchedule(state, s.id)).map((s) => s.id));
  const unbookable = state.services.filter((s) => !s.staffIds.some((id) => scheduled.has(id)));

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia tu enlace:", url);
    }
  }

  if (business.published) {
    return (
      <div className="onb-done">
        <span className="success-icon onb-done-icon"><CheckCircle2 size={32} /></span>
        <StepHeading kicker="¡Listo!" title={`${business.name} ya recibe reservas`}>
          Comparte este enlace en tu Instagram, WhatsApp o Google Maps.
        </StepHeading>
        <div className="onb-share">
          <code>{url.replace(/^https?:\/\//, "")}</code>
          <button type="button" className="btn-secondary" onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div className="onb-done-actions">
          <Link href="/dashboard" className="btn-primary">Ir a mi panel <ArrowRight size={16} /></Link>
          <a href={url} target="_blank" rel="noreferrer" className="btn-secondary">
            Ver mi página <ExternalLink size={16} />
          </a>
        </div>
      </div>
    );
  }

  const checks = [
    { ok: true, label: "Datos del negocio", step: 0 },
    { ok: state.staff.length > 0, label: `${state.staff.length} ${state.staff.length === 1 ? "persona" : "personas"} en el equipo`, step: 1 },
    { ok: scheduled.size > 0, label: "Horario de atención", step: 2 },
    { ok: state.services.length > 0, label: `${state.services.length} ${state.services.length === 1 ? "servicio" : "servicios"}`, step: 3 },
  ];

  return (
    <div>
      <StepHeading kicker="Paso 5 de 5" title="Revisa y publica">
        Al publicar, tu página quedará visible en <strong>{url.replace(/^https?:\/\//, "")}</strong>.
      </StepHeading>

      <ul className="onb-checklist">
        {checks.map((c) => (
          <li key={c.label}>
            {c.ok ? <CheckCircle2 size={18} className="onb-ok" /> : <Circle size={18} className="onb-bad" />}
            <span>{c.label}</span>
            <button type="button" className="onb-link-btn" onClick={() => goTo(c.step)}>Editar</button>
          </li>
        ))}
      </ul>

      {(withoutHours.length > 0 || unbookable.length > 0) && (
        <div className="auth-notice">
          {withoutHours.length > 0 && (
            <p>Sin horario (no aparecerán disponibles): {withoutHours.map((s) => s.name).join(", ")}.</p>
          )}
          {unbookable.length > 0 && (
            <p>Servicios que nadie con horario realiza: {unbookable.map((s) => s.name).join(", ")}.</p>
          )}
        </div>
      )}

      <ErrorBox error={error} />
      <StepFooter onBack={() => goTo(3)}>
        <button type="button" className="btn-primary" disabled={pending}
          onClick={() => run(() => publishBusinessAction(business.id))}>
          {pending ? "Publicando…" : "Publicar mi página"} <Rocket size={16} />
        </button>
      </StepFooter>
    </div>
  );
}
