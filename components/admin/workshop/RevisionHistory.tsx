"use client";

import { History, RotateCcw } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { collapseSame, lineDiff } from "@/lib/diff";
import { cn } from "@/lib/cn";
import { api, formatDate, Problems, useTr, type Lang } from "./shared";

type Revision = { id: string; origin: string; note: string | null; createdAt: string; author: string | null; authorEmail: string | null; checkpointName: string | null; data: unknown };

const ORIGIN: Record<string, [string, string]> = {
  manual: ["manuell", "manual"],
  ai: ["KI", "AI"],
  backfill: ["Skript", "script"],
  translation: ["Übersetzung", "translation"],
  restore: ["Zurücksetzen", "restore"],
  checkpoint: ["gemerkter Stand", "checkpoint"],
};

/**
 * Versionsgeschichte einer Lektion oder Frage: jede Zeile ist der Stand VOR einer Änderung. Ausgewählt zeigt sie den
 * Unterschied zum aktuell gespeicherten Stand und lässt sich wiederherstellen (der aktuelle Stand wird dabei selbst
 * zur Revision, es geht nichts verloren).
 */
export function RevisionHistory({
  certId,
  targetType,
  targetId,
  locale,
  lang,
  currentText,
  toText,
  disabled,
  onRestored,
}: {
  certId: string;
  targetType: "section" | "question";
  targetId: string;
  locale: Lang;
  lang: Lang;
  currentText: string;
  toText: (data: unknown, lang: Lang) => string;
  /** z. B. ungespeicherte Änderungen: Zurücksetzen würde sie überschreiben. */
  disabled?: string | null;
  onRestored: () => void;
}) {
  const tr = useTr(locale);
  const [revs, setRevs] = React.useState<Revision[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const r = await api<{ revisions: Revision[] }>(`/api/admin/certifications/${certId}/workshop/revisions?type=${targetType}&id=${targetId}`);
    if (r.ok) setRevs(r.data.revisions);
    else setError(r.error);
  }, [certId, targetType, targetId]);
  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const rev = revs?.find((r) => r.id === selected) ?? null;
  const diff = React.useMemo(() => (rev ? collapseSame(lineDiff(toText(rev.data, lang), currentText)) : []), [rev, lang, currentText, toText]);

  async function restore() {
    if (!rev || !window.confirm(tr("Auf diesen Stand zurücksetzen? Der aktuelle Stand bleibt in der Versionsgeschichte.", "Restore this version? The current version stays in the history."))) return;
    setBusy(true);
    const r = await api<{ result: string }>(`/api/admin/certifications/${certId}/workshop/revisions/${rev.id}/restore`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSelected(null);
    await load();
    onRestored();
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4" data-testid="revision-history">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" aria-hidden="true" />
        {tr("Versionen", "History")}
      </h3>
      {error && <div className="mt-2"><Problems title={error} /></div>}
      {revs && revs.length === 0 && <p className="mt-2 text-sm text-subtle">{tr("Noch keine früheren Stände. Jede Änderung legt den vorherigen Stand hier ab.", "No earlier versions yet. Every change keeps the previous version here.")}</p>}
      {revs && revs.length > 0 && (
        <ol className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {revs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r.id === selected ? null : r.id)}
                aria-pressed={r.id === selected}
                className={cn("flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-2", r.id === selected && "bg-accent-soft")}
                data-testid="revision-item"
              >
                <span className="font-medium">{formatDate(r.createdAt, locale)}</span>
                <Badge tone={r.origin === "ai" ? "violet" : r.origin === "checkpoint" ? "info" : "neutral"}>{(ORIGIN[r.origin] ?? [r.origin, r.origin])[locale === "de" ? 0 : 1]}</Badge>
                <span className="min-w-0 truncate text-xs text-subtle">
                  {r.checkpointName ?? r.note ?? ""}
                  {r.author || r.authorEmail ? ` · ${r.author ?? r.authorEmail}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {rev && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-subtle">{tr("Unterschied: dieser Stand (rot) → aktuell gespeichert (grün)", "Difference: this version (red) → currently saved (green)")}</p>
          <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-surface-inset p-2 font-mono text-xs leading-relaxed" data-testid="revision-diff">
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
          <Button className="mt-2" size="sm" variant="secondary" onClick={restore} disabled={busy || Boolean(disabled)} iconLeft={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />} data-testid="revision-restore">
            {tr("Diesen Stand wiederherstellen", "Restore this version")}
          </Button>
          {disabled && <p className="mt-1 text-xs text-warning-text">{disabled}</p>}
        </div>
      )}
    </section>
  );
}
