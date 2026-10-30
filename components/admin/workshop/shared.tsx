"use client";

import * as React from "react";
import { collapseSame, lineDiff } from "@/lib/diff";
import { cn } from "@/lib/cn";

/** Gemeinsames der Kurs-Werkstatt: Texte (de/en wie die übrigen Admin-Seiten inline), Fetch-Helfer, Eingabefelder. */
export type Lang = "de" | "en";
export type L = { de: string; en: string };

export function useTr(locale: Lang) {
  return React.useCallback((de: string, en: string) => (locale === "de" ? de : en), [locale]);
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; problems?: string[]; fingerprint?: string };

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, status: res.status, error: json.error ?? `HTTP ${res.status}`, problems: json.problems, fingerprint: json.fingerprint };
  } catch {
    return { ok: false, status: 0, error: "Netzwerkfehler" };
  }
}

export const inputCls = "w-full rounded-md border border-border-strong bg-control px-3 py-2 text-sm";
export const textareaCls = "w-full rounded-md border border-border-strong bg-control px-3 py-2 font-mono text-meta leading-relaxed";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

/** Fehlermeldungen (Validierung, Konflikt, Netzwerk) einheitlich. */
export function Problems({ title, items, tone = "danger" }: { title: string; items?: string[]; tone?: "danger" | "warning" }) {
  return (
    <div role="alert" className={cn("rounded-xl border p-3 text-sm", tone === "danger" ? "border-danger/40 bg-danger-soft text-danger-text" : "border-warning/40 bg-warning-soft text-warning-text")} data-testid="workshop-problems">
      <p className="font-semibold">{title}</p>
      {items && items.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {items.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function formatDate(iso: string | Date, locale: Lang) {
  return new Date(iso).toLocaleString(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Warnt beim Verlassen der Seite, solange etwas ungespeichert ist. */
export function useUnsavedWarning(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/** Zeilenweiser Unterschied zweier Texte (rot = vorher, grün = nachher), unveränderte Strecken eingeklappt. */
export function DiffView({ before, after, locale, testId }: { before: string; after: string; locale: Lang; testId?: string }) {
  const tr = useTr(locale);
  const diff = React.useMemo(() => collapseSame(lineDiff(before, after)), [before, after]);
  return (
    <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-surface-inset p-2 font-mono text-xs leading-relaxed" data-testid={testId}>
      {diff.length === 0 || diff.every((d) => d.type === "same" || d.type === "skip") ? (
        <span className="text-subtle">{tr("Kein Unterschied in dieser Sprache.", "No difference in this language.")}</span>
      ) : (
        diff.map((d, i) =>
          d.type === "skip" ? (
            <span key={i} className="block text-faint">⋯ {d.count} {tr("unveränderte Zeilen", "unchanged lines")}</span>
          ) : (
            <span key={i} className={cn("block px-1 whitespace-pre-wrap", d.type === "add" && "bg-mint-soft text-mint-text", d.type === "del" && "bg-danger-soft text-danger-text")}>
              {d.type === "add" ? "+ " : d.type === "del" ? "− " : "  "}
              {d.text || " "}
            </span>
          ),
        )
      )}
    </pre>
  );
}
