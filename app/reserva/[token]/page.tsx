import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManagedBooking } from "@/lib/bookings";
import { ManagedBookingView } from "@/components/managed-booking-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const booking = await getManagedBooking(token);
  return {
    title: booking ? `Reserva en ${booking.businessName} | AuraBook` : "Reserva no encontrada",
    robots: { index: false, follow: false },
  };
}

export default async function BookingManagePage({ params }: Props) {
  const { token } = await params;
  const booking = await getManagedBooking(token);
  if (!booking) notFound();
  return <ManagedBookingView initialBooking={booking} token={token} />;
}
