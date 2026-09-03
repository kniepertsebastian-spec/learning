"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

interface BlueprintObjective {
  code: string;
  title: string;
  description: string;
  locator: string;
  confidence: number;
}

interface BlueprintDomain {
  name: string;
  weightPercent: number | null;
  objectives: BlueprintObjective[];
}

interface BlueprintContent {
  certificationName: string;
  provider: string;
  examCode: string;
  domains: BlueprintDomain[];
}

interface BlueprintDraft {
  id: string;
  content: BlueprintContent;
  suggestedSlug: string;
  warnings: string[];
  truncatedSource: boolean;
}

const LOW_CONFIDENCE_THRESHOLD = 0.5;

function confidenceColor(confidence: number): string {
  if (confidence < LOW_CONFIDENCE_THRESHOLD) return "bg-red-500/10 text-red-600";
  if (confidence < 0.8) return "bg-yellow-500/10 text-yellow-600";
  return "bg-green-500/10 text-green-600";
}

export function BlueprintPanel({
  sourceId,
  locale,
}: {
  sourceId: string;
  locale: "de" | "en";
}) {
  const [draft, setDraft] = useState<BlueprintDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [slugDraft, setSlugDraft] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/admin/sources/${sourceId}/blueprint`, {
        cache: "no-store",
      });
      if (cancelled) return;
      if (response.ok) {
        const data = (await response.json()) as { draft: BlueprintDraft };
        setDraft(data.draft);
        setSlugDraft(data.draft.suggestedSlug);
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
      const data = (await response.json()) as { draft?: BlueprintDraft; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error ?? `Status ${response.status}`);
      setDraft(data.draft);
      setSlugDraft(data.draft.suggestedSlug);
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

  async function handleSaveSlug() {
    setSavingSlug(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sources/${sourceId}/blueprint`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestedSlug: slugDraft }),
      });
      const data = (await response.json()) as { draft?: BlueprintDraft; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error ?? `Status ${response.status}`);
      setDraft(data.draft);
      setSlugDraft(data.draft.suggestedSlug);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : locale === "de" ? "Slug konnte nicht gespeichert werden." : "Could not save slug.",
      );
    } finally {
      setSavingSlug(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-foreground/50">
          {locale === "de" ? "Blueprint-Vorschlag (R1.2)" : "Blueprint proposal (R1.2)"}
        </h3>
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
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {draft && (
        <div className="mt-3 flex flex-col gap-3">
          {draft.truncatedSource && (
            <p className="flex items-center gap-1.5 rounded-md bg-yellow-500/10 p-2 text-xs text-yellow-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {locale === "de"
                ? "Das Dokument war zu lang und wurde für die Extraktion gekürzt."
                : "The document was too long and was truncated for extraction."}
            </p>
          )}

          {draft.warnings.length > 0 && (
            <div className="rounded-md bg-yellow-500/10 p-2 text-xs text-yellow-700">
              <p className="font-medium">
                {locale === "de" ? "Warnungen" : "Warnings"} ({draft.warnings.length})
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {draft.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <label className="block text-xs">
            <span className="mb-1 block font-medium text-foreground/70">
              {locale === "de" ? "Vorgeschlagener Slug (editierbar)" : "Suggested slug (editable)"}
            </span>
            <div className="flex gap-2">
              <input
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value)}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => void handleSaveSlug()}
                disabled={savingSlug || slugDraft === draft.suggestedSlug}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
              >
                {locale === "de" ? "Speichern" : "Save"}
              </button>
            </div>
          </label>

          <div className="text-xs text-foreground/60">
            {draft.content.certificationName} · {draft.content.provider} · {draft.content.examCode}
          </div>

          <div className="flex flex-col gap-2">
            {draft.content.domains.map((domain, i) => (
              <details key={i} className="rounded-md border border-border p-2">
                <summary className="cursor-pointer text-xs font-medium">
                  {domain.name}
                  {domain.weightPercent !== null && ` · ${domain.weightPercent}%`}
                  {" · "}
                  {domain.objectives.length} {locale === "de" ? "Objectives" : "objectives"}
                </summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {domain.objectives.map((objective) => (
                    <li key={objective.code} className="text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-foreground/70">{objective.code}</span>
                        <span className="font-medium">{objective.title}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${confidenceColor(objective.confidence)}`}
                        >
                          {Math.round(objective.confidence * 100)}%
                        </span>
                        <span className="text-foreground/50">{objective.locator}</span>
                      </div>
                      <p className="mt-0.5 text-foreground/60">{objective.description}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
