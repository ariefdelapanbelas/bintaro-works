import type { Metadata } from "next";
import { SpacesPage } from "@/features/spaces/SpacePages";

export const metadata: Metadata = { title: "Ruang & Denah" };

export default function Page() {
  return <SpacesPage />;
}
