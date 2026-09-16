import type { Metadata } from "next";
import { PortalRequestsPage } from "@/features/portal/PortalPages";

export const metadata: Metadata = { title: "Bantuan" };

export default function Page() {
  return <PortalRequestsPage />;
}
