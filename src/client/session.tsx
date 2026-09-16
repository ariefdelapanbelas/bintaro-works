"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Permission } from "@/core/domain/permissions";
import type { Role } from "@/core/domain/types";
import { api, ApiError, setUnauthorizedHandler } from "./api";
import { useNav } from "./nav";

export interface Me {
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; slug: string; taxRate: number; paymentTermDays: number };
  role: Role;
  customerId: string | null;
  customerName: string | null;
  permissions: Permission[];
}

interface SessionValue {
  me: Me | null;
  loading: boolean;
  can: (p: Permission) => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const nav = useNav();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/auth/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      nav.replace(`/login?next=${encodeURIComponent(nav.pathname)}`);
    });
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setMe(null);
    nav.replace("/login");
  }, [nav]);

  const can = useCallback((p: Permission) => !!me?.permissions.includes(p), [me]);

  return <Ctx.Provider value={{ me, loading, can, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider belum dipasang");
  return v;
}

// ---- Tema (system / light / dark)
export type ThemePref = "system" | "light" | "dark";
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    localStorage.setItem("bwos-theme", pref);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}
export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem("bwos-theme");
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
