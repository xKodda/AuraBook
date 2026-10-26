import { ImageResponse } from "next/og";
import { getBusiness } from "@/lib/business";
import { CATEGORY_LABEL } from "@/lib/theme";

// Imagen para compartir la página de reservas de un negocio: su nombre y su color de marca.
export const alt = "Reserva tu hora online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BusinessOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const color = business?.brandColor ?? "#2F3A56";
  const initials = (business?.name ?? "AB").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#F7F6F2", color: "#18191C" }}>
        <div style={{ height: 22, background: color, display: "flex" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28, padding: "0 80px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ width: 120, height: 120, borderRadius: 28, background: color, color: "#fff", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 52, fontWeight: 800 }}>{initials}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 4, color: "#6B7079" }}>
                {business ? CATEGORY_LABEL[business.category].toUpperCase() : "AURABOOK"}
              </span>
              <span style={{ fontSize: 68, fontWeight: 800, letterSpacing: -1.5 }}>{business?.name ?? "Reservas online"}</span>
            </div>
          </div>
          {business?.tagline ? <div style={{ fontSize: 34, color: "#5B5F66" }}>{business.tagline}</div> : null}
          <div style={{ display: "flex", alignSelf: "flex-start", padding: "16px 28px", borderRadius: 14, background: color,
            color: "#fff", fontSize: 30, fontWeight: 800 }}>Reserva tu hora online</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 80px 48px", fontSize: 22, color: "#6B7079" }}>
          Reservas con AuraBook
        </div>
      </div>
    ),
    size,
  );
}
