import type { Metadata } from "next";
import { SettingsPage } from "@/features/settings/SettingsPages";

export const metadata: Metadata = { title: "Pengaturan" };

export default function Page() {
  return <SettingsPage />;
}
