"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Loader2, Lock, Sparkles } from "lucide-react";

interface BlueprintDraftSummary {
  id: string;
  content: { certificationName: string; provider: string; examCode: string; domains: { objectives: unknown[] }[] };
  warnings: string[];
  validationErrors: string[];
  truncatedSource: boolean;
}

export function BlueprintPanel({
  sourceId,
  certificationSlug,
  sourceStatus,
  locale,
}: {
  sourceId: string;
  certificationSlug: string;
  sourceStatus: string;
  locale: "de" | "en";
}) {
  const locked = sourceStatus === "approved" || sourceStatus === "superseded";
  const [draft, setDraft] = useState<BlueprintDraftSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/admin/sources/${sourceId}/blueprint`, {
        cache: "no-store",
      });
      if (cancelled) return;
      if (response.ok) {
        const data = (await response.json()) as { draft: BlueprintDraftSummary };
        setDraft(data.draft);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sources/${sourceId}/blueprint`, { method: "POST" });
      const data = (await response.json()) as { draft?: BlueprintDraftSummary; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error ?? `Status ${response.status}`);
      setDraft(data.draft);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : locale === "de" ? "Blueprint-Extraktion fehlgeschlagen." : "Blueprint extraction failed.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (!loaded) return null;

  const objectiveCount = draft?.content.domains.reduce((sum, d) => sum + d.objectives.length, 0) ?? 0;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-foreground/50">
          {locale === "de" ? "Blueprint-Vorschlag (R1.2/R1.3)" : "Blueprint proposal (R1.2/R1.3)"}
        </h3>
        {locked ? (
          <span className="flex items-center gap-1 text-xs text-green-700">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {locale === "de" ? "Freigegeben" : "Approved"}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3 w-3" aria-hidden="true" />
            )}
            {draft
              ? locale === "de" ? "Erneut extrahieren" : "Re-extract"
              : locale === "de" ? "Blueprint extrahieren" : "Extract blueprint"}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {draft && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-foreground/60">
            <span>
              {draft.content.certificationName} · {draft.content.provider} · {draft.content.examCode}
            </span>
            <span className="ml-2">
              {draft.content.domains.length} {locale === "de" ? "Domains" : "domains"}, {objectiveCount}{" "}
              {locale === "de" ? "Objectives" : "objectives"}
            </span>
            {draft.validationErrors.length > 0 && (
              <span className="ml-2 rounded-full bg-red-500/10 px-1.5 py-0.5 text-red-600">
                {draft.validationErrors.length} {locale === "de" ? "Fehler" : "errors"}
              </span>
            )}
            {draft.warnings.length > 0 && (
              <span className="ml-2 rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-yellow-700">
                {draft.warnings.length} {locale === "de" ? "Hinweise" : "warnings"}
              </span>
            )}
            {draft.truncatedSource && (
              <span className="ml-2 inline-flex items-center gap-1 text-yellow-700">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {locale === "de" ? "gekürzt" : "truncated"}
              </span>
            )}
          </div>
          <Link
            href={`/admin/certifications/${certificationSlug}/sources/${sourceId}/review`}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {locale === "de" ? "Prüfen & freigeben" : "Review & approve"}
          </Link>
        </div>
      )}
    </div>
  );
}
