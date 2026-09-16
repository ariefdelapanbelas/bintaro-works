"use client";
import clsx from "clsx";
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { LuCircleAlert, LuInbox, LuLoaderCircle } from "react-icons/lu";
import type { Tone } from "@/client/format";

export const cn = clsx;

// ---------------- Button ----------------
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
// Nama kelas ditulis utuh agar terdeteksi pemindai Tailwind.
const BTN: Record<BtnVariant, string> = { primary: "btn-primary", secondary: "btn-secondary", ghost: "btn-ghost", danger: "btn-danger" };
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "icon"; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={cn("btn", BTN[variant], size === "sm" && "btn-sm", size === "icon" && "btn-icon", className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <LuLoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ---------------- Badge ----------------
const TONE: Record<Tone, string> = {
  neutral: "bg-ink/[0.06] text-muted",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  brass: "bg-brass/15 text-brass",
};
const DOT: Record<Tone, string> = {
  neutral: "bg-faint",
  accent: "bg-accent",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
  brass: "bg-brass",
};
export function Badge({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold", TONE[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}
export function StatusBadge({ map, value }: { map: Record<string, [string, Tone]>; value: string }) {
  const [label, tone] = map[value] ?? [value, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

// ---------------- Form ----------------
export function Field({
  label,
  error,
  hint,
  children,
  className,
  htmlFor,
  required,
}: {
  label?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="text-bad"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-bad">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cn("input", invalid && "border-bad focus:border-bad focus:ring-bad/20", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} rows={rest.rows ?? 3} className={cn("input", className)} {...rest} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }
>(function Select({ className, options, placeholder, ...rest }, ref) {
  return (
    <select ref={ref} className={cn("input appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: CHEVRON }} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
});
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238c9792' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/** Input nominal Rupiah dengan pemisah ribuan. */
export function MoneyInput({ value, onChange, id, invalid, placeholder }: { value: number | ""; onChange: (v: number | "") => void; id?: string; invalid?: boolean; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-faint">Rp</span>
      <Input
        id={id}
        inputMode="numeric"
        invalid={invalid}
        className="num pl-9"
        placeholder={placeholder ?? "0"}
        value={value === "" ? "" : value.toLocaleString("id-ID")}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits === "" ? "" : Math.min(Number(digits), 2_000_000_000));
        }}
      />
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; id?: string }) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className="flex cursor-pointer items-center gap-3 text-[13px]">
      <button
        id={cid}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-ink/15")}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
      <span>{label}</span>
    </label>
  );
}

// ---------------- Layout ----------------
export function Card({ children, className, title, action, bodyClass, subtitle }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; bodyClass?: string }) {
  return (
    <section className={cn("card", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-faint">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn(bodyClass ?? "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-[26px] font-bold leading-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-line px-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors",
            value === t.value ? "border-accent text-ink" : "border-transparent text-faint hover:text-muted",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="num rounded-full bg-ink/[0.06] px-1.5 text-[11px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ items, value, onChange }: { items: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          aria-pressed={value === i.value}
          className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors", value === i.value ? "bg-accent-soft text-accent" : "text-muted hover:text-ink")}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {icon && <span className={cn("flex h-7 w-7 items-center justify-center rounded-md text-[15px]", TONE[tone ?? "neutral"])}>{icon}</span>}
      </div>
      <div className="num font-display text-[24px] font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white", className?.includes("h-") ? "" : "h-8 w-8", className?.includes("text-[") ? "" : "text-[11px]", className)}
      style={{ background: `hsl(${hue} 32% 38%)` }}
      aria-hidden
    >
      {name
        .replace(/^(PT|CV|dr\.|drg\.)\s+/i, "")
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")}
    </span>
  );
}

// ---------------- State ----------------
export function Spinner({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-faint" role="status">
      <LuLoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-ink/[0.06]", className)} />;
}

export function Empty({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.05] text-lg text-faint">{icon ?? <LuInbox />}</span>
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: { message: string } | null | undefined; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad" role="alert">
      <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">{error.message}</div>
      {onRetry && (
        <button className="font-semibold underline" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function KeyValue({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[11.5px] font-medium text-faint">{i.label}</dt>
          <dd className="mt-0.5 break-words text-[13.5px]">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
