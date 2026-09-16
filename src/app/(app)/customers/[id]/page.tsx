import type { Metadata } from "next";
import { CustomerDetailPage } from "@/features/customers/CustomerPages";

export const metadata: Metadata = { title: "Detail pelanggan" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetailPage id={id} />;
}
