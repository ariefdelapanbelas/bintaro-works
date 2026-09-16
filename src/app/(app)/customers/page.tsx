import type { Metadata } from "next";
import { CustomersPage } from "@/features/customers/CustomerPages";

export const metadata: Metadata = { title: "Pelanggan" };

export default function Page() {
  return <CustomersPage />;
}
