"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, House } from "lucide-react";
import {
  removeCoverAction, removeLogoAction, setBrandColorAction, setHideBrandingAction, updateBookingRulesAction, updateHomeServiceAction,
  updateNoShowPolicyAction, updateBusinessAction, uploadCoverAction, uploadLogoAction,
} from "@/app/onboarding/actions";
import { ChoiceField, useBusinessState } from "@/components/business-editors";
import { BusinessLogo } from "@/components/business-logo";
import { CoverPicker } from "@/components/cover-picker";
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
/** Minutos que se bloquean después de cada cita a domicilio, para trasladarse a la siguiente. */
const TRAVEL = [0, 10, 15, 20, 30, 45, 60, 90, 120];

export function BusinessSettings({ initial, isOwner, siteUrl, colors, canHideBranding, canNoShowPolicy }: {
  initial: OnboardingState; isOwner: boolean; siteUrl: string;
  /** Color propio (custom_branding). Sin él, la página pública usa el color de AuraBook; el logo es de todos los planes. */
  colors: boolean;
  /** Ocultar «Reservas con AuraBook» (hide_branding). */
  canHideBranding: boolean;
  /** Bloquear reservas online a quien acumula ausencias (no_show_control). */
  canNoShowPolicy: boolean;
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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [hideBranding, setHideBranding] = useState(b.hideBranding);
  // A domicilio
  const [homeEnabled, setHomeEnabled] = useState(b.homeEnabled);
  const [homeFee, setHomeFee] = useState(b.homeFeeClp ? String(b.homeFeeClp) : "");
  const [homeTravel, setHomeTravel] = useState(b.homeTravelMin);
  const [homeArea, setHomeArea] = useState(b.homeArea);
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
  const [noShowBlock, setNoShowBlock] = useState<number | null>(b.noShowBlockThreshold);

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
      if (result && !result.ok) return result;
      if (coverFile) {
        const form = new FormData();
        form.append("cover", coverFile);
        result = await uploadCoverAction(b.id, form);
      } else if (removeCover) {
        result = await removeCoverAction(b.id);
      }
      return result ?? { ok: true, state };
    }, () => {
      setLogoFile(null); setRemoveLogo(false); setCoverFile(null); setRemoveCover(false); setSaved("Marca actualizada.");
    });
  }

  const feeValue = Number(homeFee.replace(/\D/g, "") || "0");
  function saveHome(e: FormEvent) {
    e.preventDefault();
    run(() => updateHomeServiceAction(b.id, { enabled: homeEnabled, feeClp: feeValue, travelMin: homeTravel, area: homeArea }),
      () => setSaved(homeEnabled ? "Servicios a domicilio guardados. Marca en «Servicios» cuáles se hacen a domicilio." : "Servicios a domicilio desactivados."));
  }

  function saveProfile(e: FormEvent) {
    e.preventDefault();
    run(() => updateBusinessAction(b.id, { name, category, tagline, description, address, phone }),
      () => setSaved("Datos del negocio guardados."));
  }

  function saveRules(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      const result = await updateBookingRulesAction(b.id, { minNoticeMin: minNotice, maxDaysAhead: maxDays, cancelNoticeMin: cancelNotice });
      if (!result.ok || noShowBlock === b.noShowBlockThreshold) return result;
      return updateNoShowPolicyAction(b.id, noShowBlock);
    }, () => setSaved("Reglas de reserva guardadas."));
  }

  const brandDirty = logoFile !== null || removeLogo || coverFile !== null || removeCover
    || color !== b.brandColor.toUpperCase() || hideBranding !== b.hideBranding;
  const previewLogo = removeLogo ? null : b.logoUrl;
  const previewCover = removeCover ? null : b.coverUrl;
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!coverFile) return setCoverPreview(null);
    const u = URL.createObjectURL(coverFile);
    setCoverPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [coverFile]);
  const homeDirty = homeEnabled !== b.homeEnabled || feeValue !== b.homeFeeClp || homeTravel !== b.homeTravelMin || homeArea.trim() !== b.homeArea;

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
            <div className="onb-field">
              <span className="field-label">Foto de portada <em className="onb-optional">opcional</em></span>
              <CoverPicker brandColor={colors ? color : "#2F3A56"} currentUrl={previewCover} file={coverFile}
                onFile={(f) => { setCoverFile(f); setRemoveCover(false); }}
                onRemove={() => { setCoverFile(null); setRemoveCover(true); }} />
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

          <form className="dash-card dash-form" onSubmit={saveHome}>
            <h2>Servicios a domicilio</h2>
            <label className="onb-check">
              <input type="checkbox" checked={homeEnabled} onChange={(e) => setHomeEnabled(e.target.checked)} />
              <span>Hago servicios a domicilio</span>
            </label>
            {homeEnabled && (
              <>
                <div className="dash-grid-3">
                  <label className="onb-field">
                    <span className="field-label">Recargo a domicilio</span>
                    <input className="text-input" inputMode="numeric" placeholder="$0" value={homeFee ? `$${feeValue.toLocaleString("es-CL")}` : ""}
                      onChange={(e) => setHomeFee(e.target.value.replace(/\D/g, "").slice(0, 7))} />
                  </label>
                  <label className="onb-field">
                    <span className="field-label">Tiempo de traslado</span>
                    <select className="text-input" value={homeTravel} onChange={(e) => setHomeTravel(Number(e.target.value))}>
                      {[...new Set([...TRAVEL, b.homeTravelMin])].sort((x, y) => x - y).map((m) => (
                        <option key={m} value={m}>{m === 0 ? "Sin bloqueo" : `${m} min después de cada cita`}</option>
                      ))}
                    </select>
                  </label>
                  <label className="onb-field">
                    <span className="field-label">Comunas que cubres <em className="onb-optional">opcional</em></span>
                    <input className="text-input" value={homeArea} onChange={(e) => setHomeArea(e.target.value)} maxLength={200}
                      placeholder="Providencia, Ñuñoa y Las Condes" />
                  </label>
                </div>
                <p className="field-hint">
                  El recargo se suma al precio de cada servicio a domicilio y tu cliente lo ve antes de reservar. El traslado
                  bloquea tu agenda después de cada cita a domicilio, para que no te tomen otra hora mientras te mueves.
                  Marca en <Link href="/dashboard/servicios">Servicios</Link> cuáles se hacen a domicilio.
                </p>
              </>
            )}
            <div className="dash-form-foot">
              <span />
              <button type="submit" className="btn-primary dash-btn" disabled={pending || !homeDirty}>Guardar</button>
            </div>
          </form>

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
            <label className="onb-field">
              <span className="field-label">Ausencias <span className="onb-optional">Premium</span></span>
              <select className="text-input" value={noShowBlock ?? ""} disabled={!canNoShowPolicy && noShowBlock === null}
                onChange={(e) => setNoShowBlock(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">No bloquear a nadie</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n} disabled={!canNoShowPolicy}>
                    Bloquear reservas online desde {n} {n === 1 ? "ausencia" : "ausencias"} en 12 meses
                  </option>
                ))}
              </select>
            </label>
            <p className="field-hint">
              {canNoShowPolicy
                ? "Quien quede bloqueado ve un aviso para contactarte; tú igual puedes agendarlo desde el panel."
                : "Disponible con Premium, junto con el historial de asistencia de cada cliente en tu agenda."}
            </p>
            <div className="dash-form-foot">
              <span />
              <button type="submit" className="btn-primary dash-btn" disabled={pending}>Guardar reglas</button>
            </div>
          </form>
        </div>

        <aside className="dash-preview" aria-label="Vista previa">
          <span className="field-label">Así te ven tus clientes</span>
          <div className="bk-preview" style={brandStyle(colors ? color : "#2F3A56")}>
            <div className="bk-hero">
              <div className="bk-cover">{(coverPreview ?? previewCover) && <img src={coverPreview ?? previewCover!} alt="" />}</div>
              <div className="bk-hero-body">
                <span className="bk-hero-logo">
                  <BusinessLogo name={name || b.name} url={logoFile ? null : previewLogo} brandColor={colors ? color : "#2F3A56"} size={56} />
                </span>
                <div className="bk-business-text">
                  <span className="bk-kicker">{CATEGORY_COPY[category].kicker}</span>
                  <p className="bk-name">{name || b.name}</p>
                  {tagline && <p className="bk-tagline">{tagline}</p>}
                </div>
              </div>
            </div>
            {(address || phone || homeEnabled) && (
              <ul className="bk-business-meta">
                {address && <li>{address}</li>}
                {phone && <li>{phone}</li>}
                {homeEnabled && <li><House size={13} /> A domicilio{homeArea.trim() ? ` en ${homeArea.trim()}` : ""}</li>}
              </ul>
            )}
          </div>
          {logoFile && <small className="field-hint">El logo nuevo se verá al guardar la marca.</small>}
        </aside>
      </div>
    </main>
  );
}
