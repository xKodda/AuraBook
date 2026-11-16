"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { shrinkImage } from "./logo-picker";

/** Ancho máximo de la portada: nítida en pantallas grandes y bajo el límite de 512 KB del bucket. */
const COVER_MAX_SIDE = 1600;

type Props = {
  brandColor: string;
  currentUrl: string | null;
  file: File | null;
  onFile: (file: File) => void;
  onRemove: () => void;
};

/** Foto de portada de la página de reservas (local o equipo). Sin foto, se ve el color de la marca. */
export function CoverPicker({ brandColor, currentUrl, file, onFile, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      setError("Usa una imagen PNG, JPG o WebP.");
      return;
    }
    setBusy(true);
    try {
      onFile(await shrinkImage(f, COVER_MAX_SIDE, "portada"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos procesar la imagen.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const shown = preview ?? currentUrl;
  return (
    <div className="cover-picker">
      <div className="cover-picker-frame" style={{ background: brandColor }}>
        {shown && <img src={shown} alt="Foto de portada" />}
      </div>
      <div className="logo-picker-actions">
        <button type="button" className="btn-secondary logo-picker-btn" onClick={() => input.current?.click()} disabled={busy}>
          <ImagePlus size={15} /> {busy ? "Procesando…" : shown ? "Cambiar portada" : "Subir foto de portada"}
        </button>
        {shown && (
          <button type="button" className="onb-link-btn" onClick={onRemove}>
            <X size={12} /> Quitar
          </button>
        )}
        {error && <small className="onb-bad">{error}</small>}
      </div>
      <small className="field-hint">Una foto horizontal de tu local o de tu equipo. Se ve arriba de tu página de reservas.</small>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
