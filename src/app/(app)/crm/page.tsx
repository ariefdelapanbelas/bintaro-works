import type { Metadata } from "next";
import { LeadsPage } from "@/features/crm/CrmPages";

export const metadata: Metadata = { title: "CRM & Lead" };

export default function Page() {
  return <LeadsPage />;
}
