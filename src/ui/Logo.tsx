import type { ReactNode } from "react";
import logoImg from "@/bintaro-works-icon.png";
import { cn } from "./primitives";

export const logoSrc = typeof logoImg === "string" ? logoImg : (logoImg as { src?: string })?.src ?? "/bintaro-works-icon.png";

export interface LogoProps {
  className?: string;
  compact?: boolean;
  size?: "sm" | "md" | "lg";
  subtext?: ReactNode;
}

export function Logo({ className, compact, size = "md", subtext = "Business OS" }: LogoProps) {
  const imgSize = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-8 w-8";

  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <img
        src={logoSrc}
        alt="Bintaro Works Logo"
        width={40}
        height={40}
        className={cn(
          imgSize,
          "rounded-lg object-contain shadow-sm ring-1 ring-black/10 dark:ring-white/10 shrink-0 transition-transform duration-200 hover:scale-105",
        )}
      />
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[15px] font-bold tracking-tight">Bintaro Works</span>
          {subtext && <span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] opacity-60 mt-0.5">{subtext}</span>}
        </span>
      )}
    </span>
  );
}
