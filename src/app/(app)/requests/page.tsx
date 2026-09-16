import type { Metadata } from "next";
import { RequestsPage } from "@/features/requests/RequestsPage";

export const metadata: Metadata = { title: "Permintaan Layanan" };

export default function Page() {
  return <RequestsPage />;
}
