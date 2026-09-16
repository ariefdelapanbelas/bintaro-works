import type { Metadata } from "next";
import { BookingsPage } from "@/features/bookings/BookingsPage";

export const metadata: Metadata = { title: "Booking" };

export default function Page() {
  return <BookingsPage />;
}
