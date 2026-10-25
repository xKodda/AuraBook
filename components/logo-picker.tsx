"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { BusinessLogo } from "./business-logo";

const MAX_SIDE = 512;
const MAX_BYTES = 500 * 1024;

/** Reduce la imagen a ≤512 px y la convierte a WebP (o PNG si el navegador no codifica WebP). */
async function shrink(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No pudimos leer la imagen."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.75, 0.6]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
      if (blob && blob.size <= MAX_BYTES) {
        const ext = blob.type === "image/webp" ? "webp" : "png";
        return new File([blob], `logo.${ext}`, { type: blob.type });
      }
    }
    throw new Error("La imagen es demasiado pesada. Prueba con una más simple.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Props = {
  name: string;
  brandColor: string;
  currentUrl: string | null;
  file: File | null;
  onFile: (file: File) => void;
  onRemove: () => void;
};

export function LogoPicker({ name, brandColor, currentUrl, file, onFile, onRemove }: Props) {
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
      onFile(await shrink(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos procesar la imagen.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const shown = preview ?? currentUrl;
  return (
    <div className="logo-picker">
      <BusinessLogo name={name} url={shown} brandColor={brandColor} size={64} />
      <div className="logo-picker-actions">
        <button type="button" className="btn-secondary logo-picker-btn" onClick={() => input.current?.click()} disabled={busy}>
          <ImagePlus size={15} /> {busy ? "Procesando…" : shown ? "Cambiar logo" : "Subir logo"}
        </button>
        {shown && (
          <button type="button" className="onb-link-btn" onClick={onRemove}>
            <X size={12} /> Quitar
          </button>
        )}
        {error && <small className="onb-bad">{error}</small>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
