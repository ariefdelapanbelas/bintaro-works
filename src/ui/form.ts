"use client";
import { useCallback, useState } from "react";

/** State formulir sederhana dengan setter per kolom. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = useCallback(
    <K extends keyof T>(key: K) =>
      (v: T[K] | { target: { value: string } }) =>
        setValues((prev) => ({ ...prev, [key]: v && typeof v === "object" && "target" in (v as object) ? (v as { target: { value: string } }).target.value : v })),
    [],
  );
  const reset = useCallback((next: T) => setValues(next), []);
  return { values, set, setValues, reset };
}

/** Kosongkan string "" menjadi null sebelum dikirim ke API. */
export function clean<T extends Record<string, unknown>>(v: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) out[k] = val === "" ? null : val;
  return out as T;
}
