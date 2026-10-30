import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBusiness } from "@/lib/business";
import { DEMO_MODE } from "@/lib/demo";
import { BookingExperience } from "@/components/booking-experience";
import { JsonLd } from "@/components/json-ld";
import { businessLd, graph } from "@/lib/seo";
import { CATEGORY_LABEL } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusiness(slug);
  if (!business) return { title: "Negocio no encontrado", robots: { index: false } };
  // Rubro y dirección en el título y la descripción: así busca la gente («taller mecánico en Providencia»).
  const kind = business.category === "otro" ? "" : ` · ${CATEGORY_LABEL[business.category]}`;
  const where = business.address ? ` en ${business.address}` : "";
  const description = [
    business.tagline,
    `Reserva tu hora online en ${business.name}${where}: elige servicio, profesional y horario, sin crear cuenta.`,
  ].filter(Boolean).join(" ");
  const title = `${business.name}${kind} · Reserva online`;
  return {
    title,
    description,
    alternates: { canonical: `/reservar/${business.slug}` },
    openGraph: { title, description, url: `/reservar/${business.slug}` },
  };
}

export default async function BookingPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  if (!business) notFound();
  return (
    <>
      <JsonLd data={graph(businessLd(business))} />
      <BookingExperience business={business} demo={DEMO_MODE} />
    </>
  );
}
