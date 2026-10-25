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
  return { title: business ? `Reservar en ${business.name}` : "Negocio no encontrado" };
}

export default async function BookingPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  if (!business) notFound();
  return <BookingExperience business={business} demo={DEMO_MODE} />;
}
