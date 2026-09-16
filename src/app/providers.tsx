"use client";
import type { ReactNode } from "react";
import { NextNavProvider } from "@/client/next-nav";
import { SessionProvider } from "@/client/session";
import { ToastProvider } from "@/ui/overlay";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextNavProvider>
      <ToastProvider>
        <SessionProvider>{children}</SessionProvider>
      </ToastProvider>
    </NextNavProvider>
  );
}
