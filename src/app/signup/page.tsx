import type { Metadata } from "next";
import { SignupPage } from "@/features/auth/AuthPages";

export const metadata: Metadata = { title: "Daftar organisasi" };

export default function Page() {
  return <SignupPage />;
}
