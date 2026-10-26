import { ImageResponse } from "next/og";

// Imagen para compartir el sitio (WhatsApp, redes, buscadores). Colores de docs/MARCA.md.
export const alt = "AuraBook: tu página de reservas online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "72px 80px", background: "#F7F6F2", color: "#18191C" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <path d="M32 10 A22 22 0 1 0 51.05 21" fill="none" stroke="#2F3A56" strokeWidth="7" strokeLinecap="round" />
            <circle cx="43" cy="12.95" r="4.5" fill="#2F3A56" />
          </svg>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 6 }}>
            AURA<span style={{ color: "#2F3A56" }}>BOOK</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2, display: "flex", flexDirection: "column" }}>
            <span>Tu agenda llena,</span>
            <span style={{ color: "#2F3A56" }}>sin perseguir mensajes.</span>
          </div>
          <div style={{ fontSize: 30, color: "#5B5F66" }}>Reservas online para barberías, peluquerías, belleza, estética y spa.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#6B7079" }}>
          <span>aurabook.clikium.cl</span>
          <span>Un producto de Clikium</span>
        </div>
      </div>
    ),
    size,
  );
}
