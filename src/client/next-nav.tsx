"use client";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, type ReactNode } from "react";
import { NavProvider, type NavAdapter } from "./nav";

function Inner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const adapter = useMemo<NavAdapter>(
    () => ({
      pathname,
      search: search ? `?${search}` : "",
      push: (href) => router.push(href),
      replace: (href) => router.replace(href),
      Link: NextLink as unknown as NavAdapter["Link"],
    }),
    [pathname, search, router],
  );
  return <NavProvider adapter={adapter}>{children}</NavProvider>;
}

export function NextNavProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Inner>{children}</Inner>
    </Suspense>
  );
}
