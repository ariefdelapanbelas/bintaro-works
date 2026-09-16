import type { Metadata } from "next";
import { SpaceDetailPage } from "@/features/spaces/SpacePages";

export const metadata: Metadata = { title: "Detail ruang" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SpaceDetailPage id={id} />;
}
