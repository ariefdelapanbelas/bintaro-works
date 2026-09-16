import type { Metadata } from "next";
import { PortalInvoicePage } from "@/features/portal/PortalPages";

export const metadata: Metadata = { title: "Invoice" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortalInvoicePage id={id} />;
}
