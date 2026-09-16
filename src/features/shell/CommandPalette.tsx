"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LuBuilding2, LuCornerDownLeft, LuFileText, LuHandshake, LuReceipt, LuSearch, LuUsers } from "react-icons/lu";
import { api } from "@/client/api";
import { useDebounced } from "@/client/hooks";
import { useNav } from "@/client/nav";
import { cn } from "@/ui/primitives";

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_ICON: Record<string, ReactNode> = {
  customer: <LuUsers />,
  lead: <LuHandshake />,
  contract: <LuFileText />,
  invoice: <LuReceipt />,
  space: <LuBuilding2 />,
};
const TYPE_LABEL: Record<string, string> = { customer: "Pelanggan", lead: "Lead", contract: "Kontrak", invoice: "Invoice", space: "Ruang" };

export function CommandPalette({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: { href: string; label: string; icon: ReactNode }[] }) {
  const { push } = useNav();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dq = useDebounced(q, 180);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setActive(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (dq.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    api
      .get<Hit[]>("/search", { q: dq })
      .then((r) => !cancelled && (setHits(r), setActive(0)))
      .catch(() => !cancelled && setHits([]));
    return () => {
      cancelled = true;
    };
  }, [dq]);

  if (!open) return null;
  const pages = nav.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())).map((n) => ({ type: "page", id: n.href, title: n.label, subtitle: "Buka halaman", href: n.href, icon: n.icon }));
  const list: (Hit & { icon?: ReactNode })[] = q.trim().length >= 2 ? [...hits, ...pages] : pages;

  const go = (h: Hit) => {
    onClose();
    push(h.href);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Pencarian">
      <div className="absolute inset-0 bg-side/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <LuSearch className="h-4 w-4 text-faint" />
          <input
            ref={input}
            id="command-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, list.length - 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
              if (e.key === "Enter" && list[active]) go(list[active]);
            }}
            placeholder="Ketik nama pelanggan, nomor invoice, kode ruang…"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-[10px] text-faint">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {list.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-faint">{q.length >= 2 ? "Tidak ada hasil." : "Ketik minimal 2 huruf untuk mencari."}</li>}
          {list.map((h, i) => (
            <li key={`${h.type}-${h.id}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active ? "bg-accent-soft" : "")}
              >
                <span className={cn("text-[16px]", i === active ? "text-accent" : "text-faint")}>{h.icon ?? TYPE_ICON[h.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{h.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {TYPE_LABEL[h.type] ? `${TYPE_LABEL[h.type]} · ` : ""}
                    {h.subtitle}
                  </span>
                </span>
                {i === active && <LuCornerDownLeft className="h-3.5 w-3.5 text-faint" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
