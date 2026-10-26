import type { MetadataRoute } from "next";
import { DEMO_BUSINESSES } from "@/lib/demo";
import { DEMO_MODE, PUBLIC_ORIGIN } from "@/lib/env";
import { publicDb } from "@/lib/supabase";

// Se regenera cada hora: así entran las páginas de reservas de los negocios recién publicados.
export const revalidate = 3600;

const PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/precios", priority: 0.9, changeFrequency: "monthly" },
  { path: "/demo", priority: 0.7, changeFrequency: "monthly" },
  { path: "/registro", priority: 0.6, changeFrequency: "yearly" },
  { path: "/terminos", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacidad", priority: 0.3, changeFrequency: "yearly" },
  { path: "/tratamiento-datos", priority: 0.2, changeFrequency: "yearly" },
  { path: "/seguridad", priority: 0.3, changeFrequency: "yearly" },
];

async function publishedSlugs(): Promise<string[]> {
  if (DEMO_MODE) return DEMO_BUSINESSES.map((b) => b.slug);
  const { data, error } = await publicDb().from("businesses").select("slug").eq("is_active", true).limit(5000);
  if (error) {
    console.error("sitemap:", error.message);
    return [];
  }
  return (data ?? []).map((b: { slug: string }) => b.slug);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await publishedSlugs();
  return [
    ...PAGES.map((p) => ({ url: `${PUBLIC_ORIGIN}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority })),
    ...slugs.map((slug) => ({ url: `${PUBLIC_ORIGIN}/reservar/${slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
