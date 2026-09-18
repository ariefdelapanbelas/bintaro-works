import type { Metadata } from "next";
import { PublicInquiryPage } from "@/features/public/PublicApp";

export const metadata: Metadata = {
  title: "Ajukan sewa kantor",
  description: "Ceritakan kebutuhan ruang kerja Anda — tim kami menghubungi Anda pada jam kerja.",
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicInquiryPage slug={slug} />;
}
