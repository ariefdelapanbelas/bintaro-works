import type { Metadata } from "next";
import { PortalHomePage } from "@/features/portal/PortalPages";

export const metadata: Metadata = { title: "Portal Pelanggan" };

export default function Page() {
  return <PortalHomePage />;
}
