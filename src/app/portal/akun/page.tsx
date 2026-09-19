import type { Metadata } from "next";
import { PortalAccountPage } from "@/features/portal/PortalAccountPage";

export const metadata: Metadata = { title: "Akun saya" };

export default function Page() {
  return <PortalAccountPage />;
}
