import type { Metadata } from "next";
import { AuditPage } from "@/features/settings/SettingsPages";

export const metadata: Metadata = { title: "Log Aktivitas" };

export default function Page() {
  return <AuditPage />;
}
