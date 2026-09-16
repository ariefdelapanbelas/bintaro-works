"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LuCircleCheck, LuCircleAlert, LuX } from "react-icons/lu";
import { Button, cn } from "./primitives";

// ---------------- Modal ----------------
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea,button[data-autofocus]");
      (first ?? panel.current)?.focus();
    }, 30);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, mounted]);
  if (!open || !mounted) return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-side/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn("relative flex max-h-[92vh] w-full animate-scale-in flex-col rounded-t-2xl border border-line bg-surface shadow-pop outline-none sm:rounded-2xl", width)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <button className="btn btn-ghost btn-icon -mr-2 -mt-1" onClick={onClose} aria-label="Tutup">
            <LuX className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-raised px-5 py-3 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------- Toast ----------------
interface ToastItem {
  id: number;
  kind: "success" | "error";
  message: string;
}
const ToastCtx = createContext<{ success: (m: string) => void; error: (m: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, kind, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  const value = useRef({ success: (m: string) => push("success", m), error: (m: string) => push("error", m) }).current;
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-sm animate-fade-up items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-medium shadow-pop",
              t.kind === "success" ? "border-line bg-surface text-ink" : "border-bad/30 bg-bad-soft text-bad",
            )}
          >
            {t.kind === "success" ? <LuCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-good" /> : <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("ToastProvider belum dipasang");
  return ctx;
}

// ---------------- Konfirmasi ----------------
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Ya, lanjutkan",
  danger,
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13.5px] text-muted">{message}</div>
      {children && <div className="mt-4">{children}</div>}
    </Modal>
  );
}

// ---------------- Menu dropdown ----------------
export function Menu({ trigger, items, align = "right" }: { trigger: ReactNode; items: ({ label: ReactNode; onClick: () => void; danger?: boolean; icon?: ReactNode } | null | false)[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className={cn("absolute z-40 mt-1 min-w-[200px] animate-scale-in rounded-xl border border-line bg-surface p-1 shadow-pop", align === "right" ? "right-0" : "left-0")} role="menu">
          {items.filter(Boolean).map((it, i) => {
            const item = it as { label: ReactNode; onClick: () => void; danger?: boolean; icon?: ReactNode };
            return (
              <button
                key={i}
                role="menuitem"
                className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium hover:bg-ink/5", item.danger ? "text-bad" : "text-ink")}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
