import { brandStyle } from "@/lib/theme";

/** Logo del negocio, o sus iniciales sobre el color de marca si no tiene logo. */
export function BusinessLogo({ name, url, brandColor, size = 40 }: {
  name: string; url: string | null; brandColor: string; size?: number;
}) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "·";
  return (
    <span className={`biz-logo${url ? " has-image" : ""}`} style={{ ...brandStyle(brandColor), width: size, height: size, fontSize: size * 0.36 }}>
      {url
        ? <img src={url} alt={`Logo de ${name}`} width={size} height={size} />
        : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}
