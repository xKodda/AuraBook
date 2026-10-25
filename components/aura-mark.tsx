/**
 * Isotipo oficial de AuraBook («Halo»): un anillo abierto con un punto en la abertura.
 * Toma el color del texto (`currentColor`). Archivos oficiales en /public/brand.
 */
export function AuraMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role={title ? "img" : undefined}
      aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <path d="M32 10 A22 22 0 1 0 51.05 21" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <circle cx="43" cy="12.95" r="4.5" fill="currentColor" />
    </svg>
  );
}

