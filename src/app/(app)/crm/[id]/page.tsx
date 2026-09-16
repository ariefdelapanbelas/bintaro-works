import type { Metadata } from "next";
import { LeadDetailPage } from "@/features/crm/CrmPages";

export const metadata: Metadata = { title: "Detail lead" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadDetailPage id={id} />;
}
