import type { Metadata } from "next";
import { BillingPage } from "@/features/billing/BillingPages";

export const metadata: Metadata = { title: "Tagihan" };

export default function Page() {
  return <BillingPage />;
}
