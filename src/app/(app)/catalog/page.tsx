import type { Metadata } from "next";
import { CatalogPage } from "@/features/catalog/CatalogPage";

export const metadata: Metadata = { title: "Katalog Layanan" };

export default function Page() {
  return <CatalogPage />;
}
