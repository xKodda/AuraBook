import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBusiness } from "@/lib/business";
import { DEMO_MODE } from "@/lib/demo";
import { BookingExperience } from "@/components/booking-experience";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusiness(slug);
  if (!business) return { title: "Negocio no encontrado", robots: { index: false } };
  const description = business.tagline
    ? `${business.tagline} Reserva tu hora online en ${business.name}, sin crear cuenta.`
    : `Reserva tu hora online en ${business.name}, sin crear cuenta.`;
  return {
    title: `Reservar en ${business.name}`,
    description,
    alternates: { canonical: `/reservar/${business.slug}` },
    openGraph: { title: `Reservar en ${business.name}`, description, url: `/reservar/${business.slug}` },
  };
}

export default async function BookingPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  if (!business) notFound();
  return <BookingExperience business={business} demo={DEMO_MODE} />;
}
