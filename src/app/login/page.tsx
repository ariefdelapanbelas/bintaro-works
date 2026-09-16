import type { Metadata } from "next";
import { LoginPage } from "@/features/auth/AuthPages";

export const metadata: Metadata = { title: "Masuk" };

export default function Page() {
  return <LoginPage />;
}
