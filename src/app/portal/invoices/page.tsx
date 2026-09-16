import type { Metadata } from "next";
import { PortalInvoicesPage } from "@/features/portal/PortalPages";

export const metadata: Metadata = { title: "Tagihan" };

export default function Page() {
  return <PortalInvoicesPage />;
}
