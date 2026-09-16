import type { Metadata } from "next";
import { ContractDetailPage } from "@/features/contracts/ContractPages";

export const metadata: Metadata = { title: "Detail kontrak" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractDetailPage id={id} />;
}
