"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  removeLogoAction, setBrandColorAction, setHideBrandingAction, updateBookingRulesAction, updateBusinessAction, uploadLogoAction,
} from "@/app/onboarding/actions";
import { ChoiceField, useBusinessState } from "@/components/business-editors";
import { BusinessLogo } from "@/components/business-logo";
import { LogoPicker } from "@/components/logo-picker";
import { BRAND_COLORS, TAGLINES } from "@/lib/presets";
import { CATEGORY_COPY, CATEGORY_LABEL, brandStyle } from "@/lib/theme";
import type { BusinessCategory, OnboardingState } from "@/lib/types";
import { PageHead, Saved } from "./common";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as BusinessCategory[];

function minutesLabel(m: number): string {
  if (m === 0) return "Sin mínimo";
  if (m < 60) return `${m} minutos`;
  if (m % 1440 === 0) return m === 1440 ? "1 día" : `${m / 1440} días`;
  return m === 60 ? "1 hora" : `${m / 60} horas`;
}
const withCurrent = (list: number[], v: number) => [...new Set([...list, v])].sort((a, b) => a - b);
const MIN_NOTICE = [0, 15, 30, 60, 120, 240, 720, 1440];
const MAX_DAYS = [7, 14, 30, 45, 60, 90, 180];
const CANCEL = [0, 60, 120, 240, 720, 1440, 2880];

export function BusinessSettings({ initial, isOwner, siteUrl, colors, canHideBranding }: {
  initial: OnboardingState; isOwner: boolean; siteUrl: string;
  /** Color propio (custom_branding). Sin él, la página pública usa el color de AuraBook; el logo es de todos los planes. */
  colors: boolean;
  /** Ocultar «Reservas con AuraBook» (hide_branding). */
  canHideBranding: boolean;
}) {
  const { state, run, pending, error } = useBusinessState(initial);
  const b = state.business!;
  const [saved, setSaved] = useState<string | null>(null);
  const [origin, setOrigin] = useState(siteUrl);
  const [copied, setCopied] = useState(false);

  // Marca
  const [color, setColor] = useState(b.brandColor.toUpperCase());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [hideBranding, setHideBranding] = useState(b.hideBranding);
  // Datos
  const [name, setName] = useState(b.name);
  const [category, setCategory] = useState<BusinessCategory>(b.category);
  const [tagline, setTagline] = useState(b.tagline);
  const [description, setDescription] = useState(b.description);
  const [address, setAddress] = useState(b.address);
  const [phone, setPhone] = useState(b.phone);
  // Reglas
  const [minNotice, setMinNotice] = useState(b.minNoticeMin);
  const [maxDays, setMaxDays] = useState(b.maxDaysAhead);
  const [cancelNotice, setCancelNotice] = useState(b.cancelNoticeMin);

  useEffect(() => { if (!siteUrl) setOrigin(window.location.origin); }, [siteUrl]);
  const url = `${origin}/reservar/${b.slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia tu enlace:", url);
    }
  }

  function saveBrand() {
    run(async () => {
      let result = color !== b.brandColor.toUpperCase() ? await setBrandColorAction(b.id, color) : null;
      if (result && !result.ok) return result;
      if (hideBranding !== b.hideBranding) {
        result = await setHideBrandingAction(b.id, hideBranding);
        if (!result.ok) return result;
      }
      if (logoFile) {
        const form = new FormData();
        form.append("logo", logoFile);
        result = await uploadLogoAction(b.id, form);
      } else if (removeLogo) {
        result = await removeLogoAction(b.id);
      }
      return result ?? { ok: true, state };
    }, () => { setLogoFile(null); setRemoveLogo(false); setSaved("Marca actualizada."); });
  }

  function saveProfile(e: FormEvent) {
    e.preventDefault();
    run(() => updateBusinessAction(b.id, { name, category, tagline, description, address, phone }),
      () => setSaved("Datos del negocio guardados."));
  }

  function saveRules(e: FormEvent) {
    e.preventDefault();
    run(() => updateBookingRulesAction(b.id, { minNoticeMin: minNotice, maxDaysAhead: maxDays, cancelNoticeMin: cancelNotice }),
      () => setSaved("Reglas de reserva guardadas."));
  }

  const brandDirty = logoFile !== null || removeLogo || color !== b.brandColor.toUpperCase() || hideBranding !== b.hideBranding;
  const previewLogo = removeLogo ? null : b.logoUrl;

  return (
    <main className="dash-page">
      <PageHead title="Datos y marca" subtitle={<>Tu enlace: <strong>{url.replace(/^https?:\/\//, "")}</strong></>}>
        <button type="button" className="btn-secondary dash-btn" onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copiado" : "Copiar enlace"}
        </button>
        <a className="btn-secondary dash-btn" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ver página</a>
      </PageHead>
      <Saved message={saved} />
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="dash-split">
        <div className="dash-stack">
          <section className="dash-card dash-form">
            <h2>Marca</h2>
            <div className="onb-brand">
              <LogoPicker name={name || b.name} brandColor={colors ? color : "#2F3A56"} currentUrl={previewLogo} file={logoFile}
                onFile={(f) => { setLogoFile(f); setRemoveLogo(false); }}
                onRemove={() => { setLogoFile(null); setRemoveLogo(true); }} />
              {/* El color y ocultar la marca son de Premium; el logo, de todos los planes. */}
              <fieldset className="dash-fieldset" disabled={!colors}>
                <div className="onb-swatches" role="radiogroup" aria-label="Color de marca">
                  {BRAND_COLORS.map((c) => (
                    <button key={c.hex} type="button" role="radio" aria-checked={color === c.hex}
                      className={`onb-swatch${color === c.hex ? " selected" : ""}`} style={{ background: c.hex }}
                      title={c.name} aria-label={c.name} onClick={() => setColor(c.hex)}>
                      {color === c.hex && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <label className={`onb-check small${canHideBranding ? "" : " is-disabled"}`}>
              <input type="checkbox" checked={hideBranding} disabled={!canHideBranding} onChange={(e) => setHideBranding(e.target.checked)} />
              <span>Ocultar «Reservas con AuraBook» al pie de mi página</span>
            </label>
            {(!colors || !canHideBranding) && (
              <p className="plan-note">
                Tus colores y ocultar la marca AuraBook son parte de Premium. Tu logo se muestra en todos los planes.{" "}
                <Link href="/dashboard/plan">Ver Premium</Link>
              </p>
            )}
            <div className="dash-form-foot">
              <span />
              <button type="button" className="btn-primary dash-btn" disabled={pending || !brandDirty} onClick={saveBrand}>
                {pending ? "Guardando…" : "Guardar marca"}
              </button>
            </div>
          </section>

          {isOwner && (
            <form className="dash-card dash-form" onSubmit={saveProfile}>
              <h2>Datos del negocio</h2>
              <label className="onb-field">
                <span className="field-label">Nombre</span>
                <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
              </label>
              <fieldset className="onb-field">
                <legend className="field-label">Rubro</legend>
                <div className="onb-chips">
                  {CATEGORIES.map((c) => (
                    <button key={c} type="button" className={`onb-chip${category === c ? " selected" : ""}`}
                      aria-pressed={category === c} onClick={() => setCategory(c)}>{CATEGORY_LABEL[c]}</button>
                  ))}
                </div>
              </fieldset>
              <ChoiceField key={`tagline-${category}`} label="Frase corta" optional options={TAGLINES[category]}
                value={tagline} onChange={setTagline} maxLength={160} placeholder="Escribe tu propia frase" />
              <label className="onb-field">
                <span className="field-label">Descripción <em className="onb-optional">opcional</em></span>
                <textarea className="text-input onb-textarea" rows={3} maxLength={600} value={description}
                  onChange={(e) => setDescription(e.target.value)} />
              </label>
              <div className="onb-grid-2">
                <label className="onb-field">
                  <span className="field-label">Dirección</span>
                  <input className="text-input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} autoComplete="street-address" />
                </label>
                <label className="onb-field">
                  <span className="field-label">Teléfono / WhatsApp</span>
                  <input className="text-input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" />
                </label>
              </div>
              <div className="dash-form-foot">
                <span />
                <button type="submit" className="btn-primary dash-btn" disabled={pending || name.trim().length < 2}>Guardar datos</button>
              </div>
            </form>
          )}

          <form className="dash-card dash-form" onSubmit={saveRules}>
            <h2>Reglas de reserva</h2>
            <div className="dash-grid-3">
              <label className="onb-field">
                <span className="field-label">Anticipación mínima</span>
                <select className="text-input" value={minNotice} onChange={(e) => setMinNotice(Number(e.target.value))}>
                  {withCurrent(MIN_NOTICE, b.minNoticeMin).map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
                </select>
              </label>
              <label className="onb-field">
                <span className="field-label">Reservar hasta</span>
                <select className="text-input" value={maxDays} onChange={(e) => setMaxDays(Number(e.target.value))}>
                  {withCurrent(MAX_DAYS, b.maxDaysAhead).map((d) => <option key={d} value={d}>{d} días antes</option>)}
                </select>
              </label>
              <label className="onb-field">
                <span className="field-label">Cancelar online hasta</span>
                <select className="text-input" value={cancelNotice} onChange={(e) => setCancelNotice(Number(e.target.value))}>
                  {withCurrent(CANCEL, b.cancelNoticeMin).map((m) => (
                    <option key={m} value={m}>{m === 0 ? "Hasta la hora de la cita" : `${minutesLabel(m)} antes`}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="field-hint">Pasado el plazo de cancelación, el cliente debe avisarte directamente.</p>
            <div className="dash-form-foot">
              <span />
              <button type="submit" className="btn-primary dash-btn" disabled={pending}>Guardar reglas</button>
            </div>
          </form>
        </div>

        <aside className="dash-preview" aria-label="Vista previa">
          <span className="field-label">Así te ven tus clientes</span>
          <div className="bk-business" style={brandStyle(color)}>
            <BusinessLogo name={name || b.name} url={logoFile ? null : previewLogo} brandColor={color} size={52} />
            <div className="bk-business-text">
              <span className="bk-kicker">{CATEGORY_COPY[category].kicker}</span>
              <h1>{name || b.name}</h1>
              {tagline && <p className="bk-tagline">{tagline}</p>}
            </div>
            {(address || phone) && (
              <ul className="bk-business-meta">
                {address && <li>{address}</li>}
                {phone && <li>{phone}</li>}
              </ul>
            )}
          </div>
          {logoFile && <small className="field-hint">El logo nuevo se verá al guardar la marca.</small>}
        </aside>
      </div>
    </main>
  );
}
