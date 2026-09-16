import { redirect } from "next/navigation";

// proxy.ts mengarahkan "/" sesuai role; ini cadangan bila proxy dilewati.
export default function Home() {
  redirect("/dashboard");
}
