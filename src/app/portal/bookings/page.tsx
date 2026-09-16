import type { Metadata } from "next";
import { PortalBookingsPage } from "@/features/portal/PortalPages";

export const metadata: Metadata = { title: "Booking ruang" };

export default function Page() {
  return <PortalBookingsPage />;
}
