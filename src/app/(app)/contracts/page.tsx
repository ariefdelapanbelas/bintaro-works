import type { Metadata } from "next";
import { ContractsPage } from "@/features/contracts/ContractPages";

export const metadata: Metadata = { title: "Kontrak" };

export default function Page() {
  return <ContractsPage />;
}
