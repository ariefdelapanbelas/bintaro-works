"use client";
// Abstraksi navigasi: Next.js menyuntikkan adapter next/link + next/navigation,
// demo in-browser menyuntikkan router berbasis hash. Komponen fitur hanya
// bergantung pada modul ini.
import { createContext, useContext, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from "react";

export interface NavAdapter {
  pathname: string;
  search: string;
  push: (href: string) => void;
  replace: (href: string) => void;
  Link: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }>;
}

const NavContext = createContext<NavAdapter | null>(null);

export function NavProvider({ adapter, children }: { adapter: NavAdapter; children: ReactNode }) {
  return <NavContext.Provider value={adapter}>{children}</NavContext.Provider>;
}

export function useNav(): NavAdapter {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("NavProvider belum dipasang");
  return ctx;
}

export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  const { Link: Impl } = useNav();
  return <Impl {...props} />;
}

export function useSearchParam(name: string): string | null {
  const { search } = useNav();
  return new URLSearchParams(search).get(name);
}
