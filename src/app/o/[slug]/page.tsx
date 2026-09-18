import type { Metadata } from "next";
import { PublicHomePage } from "@/features/public/PublicApp";

export const metadata: Metadata = {
  title: "Sewa ruang & layanan",
  description: "Kantor siap pakai, ruang meeting, dan studio — cek ketersediaan dan pesan langsung.",
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicHomePage slug={slug} />;
}
