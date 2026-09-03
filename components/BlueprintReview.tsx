"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Save, ShieldCheck } from "lucide-react";
import type { BlueprintExtraction } from "@/lib/server/ai/service";

interface SourcePage {
  pageNumber: number;
  content: string;
}

interface DraftState {
  content: BlueprintExtraction;
  suggestedSlug: string;
  warnings: string[];
  validationErrors: string[];
  truncatedSource: boolean;
}

const LOCKED_STATUSES = new Set(["approved", "superseded"]);

function updateDomain(
  content: BlueprintExtraction,
  domainIndex: number,
  patch: Partial<BlueprintExtraction["domains"][number]>,
): BlueprintExtraction {
  return {
    ...content,
    domains: content.domains.map((domain, i) => (i === domainIndex ? { ...domain, ...patch } : domain)),
  };
}

function updateObjective(
  content: BlueprintExtraction,
  domainIndex: number,
  objectiveIndex: number,
  patch: Partial<BlueprintExtraction["domains"][number]["objectives"][number]>,
): BlueprintExtraction {
  return {
    ...content,
    domains: content.domains.map((domain, i) => {
      if (i !== domainIndex) return domain;
      return {
        ...domain,
        objectives: domain.objectives.map((objective, j) =>
          j === objectiveIndex ? { ...objective, ...patch } : objective,
        ),
      };
    }),
  };
}

function confidenceColor(confidence: number): string {
  if (confidence < 0.5) return "bg-red-500/10 text-red-600";
  if (confidence < 0.8) return "bg-yellow-500/10 text-yellow-600";
  return "bg-green-500/10 text-green-600";
}

export function BlueprintReview({
  sourceId,
  locale,
  initialStatus,
  initialPages,
  initialDraft,
}: {
  sourceId: string;
  locale: "de" | "en";
  initialStatus: string;
  initialPages: SourcePage[];
  initialDraft: DraftState;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [content, setContent] = useState<BlueprintExtraction>(initialDraft.content);
  const [slug, setSlug] = useState(initialDraft.suggestedSlug);
  const [errors, setErrors] = useState(initialDraft.validationErrors);
  const [warnings, setWarnings] = useState(initialDraft.warnings);
  const [truncated] = useState(initialDraft.truncatedSource);
  const [pages] = useState(initialPages);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const locked = LOCKED_STATUSES.has(status);

  async function save(): Promise<boolean> {
    setSaving(true);
    setRequestError(null);
    setSavedNote(null);
    try {
      const response = await fetch(`/api/admin/sources/${sourceId}/blueprint`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, suggestedSlug: slug }),
      });
      const data = (await response.json()) as {
        draft?: { content: BlueprintExtraction; suggestedSlug: string; warnings: string[]; validationErrors: string[] };
        error?: string;
      };
      if (!response.ok || !data.draft) throw new Error(data.error ?? `Status ${response.status}`);
      setContent(data.draft.content);
      setSlug(data.draft.suggestedSlug);
      setErrors(data.draft.validationErrors);
      setWarnings(data.draft.warnings);
      setSavedNote(locale === "de" ? "Entwurf gespeichert." : "Draft saved.");
      return true;
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : locale === "de" ? "Speichern fehlgeschlagen." : "Save failed.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setRequestError(null);
    try {
      const savedOk = await save();
      if (!savedOk) return;

      const response = await fetch(`/api/admin/sources/${sourceId}/approve`, { method: "POST" });
      const data = (await response.json()) as { source?: { status: string }; error?: string };
      if (!response.ok || !data.source) throw new Error(data.error ?? `Status ${response.status}`);
      setStatus(data.source.status);
      router.refresh();
    } catch (err) {
      setRequestError(
        err instanceof Error
          ? err.message
          : locale === "de" ? "Freigabe fehlgeschlagen." : "Approval failed.",
      );
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-700">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {status === "approved"
            ? locale === "de"
              ? "Freigegeben - Domains und Objectives wurden übernommen. Weitere Korrekturen sind gesperrt."
              : "Approved - domains and objectives have been applied. Further edits are locked."
            : locale === "de"
              ? "Diese Quelle wurde ersetzt und ist gesperrt."
              : "This source has been superseded and is locked."}
        </div>
      )}

      {truncated && (
        <p className="flex items-center gap-1.5 rounded-md bg-yellow-500/10 p-2 text-xs text-yellow-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {locale === "de"
            ? "Das Dokument war zu lang und wurde für die Extraktion gekürzt."
            : "The document was too long and was truncated for extraction."}
        </p>
      )}

      {errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-500/10 p-3 text-sm text-red-700">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {locale === "de" ? "Fehler (blockieren die Freigabe)" : "Errors (block approval)"} ({errors.length})
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-700">
          <p className="font-medium">
            {locale === "de" ? "Hinweise" : "Warnings"} ({warnings.length})
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 font-medium">{locale === "de" ? "Originalquelle" : "Original source"}</h2>
          <div className="max-h-[70vh] overflow-y-auto rounded-md bg-background p-3 text-xs">
            {pages.length === 0 ? (
              <p className="text-foreground/60">
                {locale === "de" ? "Kein extrahierter Seitentext vorhanden." : "No extracted page text available."}
              </p>
            ) : (
              pages.map((page) => (
                <div key={page.pageNumber} className="mb-4">
                  <p className="mb-1 font-mono font-medium text-foreground/50">
                    {locale === "de" ? "Seite" : "Page"} {page.pageNumber}
                  </p>
                  <p className="whitespace-pre-wrap text-foreground/80">{page.content}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-medium">
            {locale === "de" ? "Extrahierte Struktur" : "Extracted structure"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-foreground/70">
                {locale === "de" ? "Zertifizierung" : "Certification"}
              </span>
              <input
                value={content.certificationName}
                disabled={locked}
                onChange={(e) => setContent({ ...content, certificationName: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-foreground/70">
                {locale === "de" ? "Anbieter" : "Provider"}
              </span>
              <input
                value={content.provider}
                disabled={locked}
                onChange={(e) => setContent({ ...content, provider: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-foreground/70">
                {locale === "de" ? "Exam-Code" : "Exam code"}
              </span>
              <input
                value={content.examCode}
                disabled={locked}
                onChange={(e) => setContent({ ...content, examCode: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
              />
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block font-medium text-foreground/70">
              {locale === "de" ? "Vorgeschlagener Slug" : "Suggested slug"}
            </span>
            <input
              value={slug}
              disabled={locked}
              onChange={(e) => setSlug(e.target.value)}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs disabled:opacity-60"
            />
          </label>

          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
            {content.domains.map((domain, domainIndex) => (
              <div key={domainIndex} className="rounded-md border border-border p-3">
                <div className="flex gap-2">
                  <input
                    value={domain.name}
                    disabled={locked}
                    onChange={(e) => setContent(updateDomain(content, domainIndex, { name: e.target.value }))}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium disabled:opacity-60"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={domain.weightPercent ?? ""}
                    disabled={locked}
                    placeholder="%"
                    onChange={(e) =>
                      setContent(
                        updateDomain(content, domainIndex, {
                          weightPercent: e.target.value === "" ? null : Number(e.target.value),
                        }),
                      )
                    }
                    className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
                  />
                </div>

                <ul className="mt-2 flex flex-col gap-2">
                  {domain.objectives.map((objective, objectiveIndex) => (
                    <li key={objectiveIndex} className="rounded-md bg-background p-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          value={objective.code}
                          disabled={locked}
                          onChange={(e) =>
                            setContent(
                              updateObjective(content, domainIndex, objectiveIndex, { code: e.target.value }),
                            )
                          }
                          className="w-16 rounded border border-border bg-surface px-1.5 py-1 font-mono text-xs disabled:opacity-60"
                        />
                        <input
                          value={objective.title}
                          disabled={locked}
                          onChange={(e) =>
                            setContent(
                              updateObjective(content, domainIndex, objectiveIndex, { title: e.target.value }),
                            )
                          }
                          className="flex-1 rounded border border-border bg-surface px-1.5 py-1 text-xs font-medium disabled:opacity-60"
                        />
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${confidenceColor(objective.confidence)}`}
                          title={locale === "de" ? "Extraktionssicherheit" : "Extraction confidence"}
                        >
                          {Math.round(objective.confidence * 100)}%
                        </span>
                        <span className="text-[10px] text-foreground/50">{objective.locator}</span>
                      </div>
                      <textarea
                        value={objective.description}
                        disabled={locked}
                        rows={2}
                        onChange={(e) =>
                          setContent(
                            updateObjective(content, domainIndex, objectiveIndex, {
                              description: e.target.value,
                            }),
                          )
                        }
                        className="mt-1.5 w-full rounded border border-border bg-surface px-1.5 py-1 text-xs disabled:opacity-60"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || approving}
            className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {locale === "de" ? "Entwurf speichern" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => void handleApprove()}
            disabled={saving || approving || errors.length > 0}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              errors.length > 0
                ? locale === "de" ? "Erst Fehler beheben" : "Fix errors first"
                : undefined
            }
          >
            {approving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            )}
            {locale === "de" ? "Blueprint freigeben" : "Approve blueprint"}
          </button>
          {savedNote && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {savedNote}
            </span>
          )}
        </div>
      )}

      {requestError && <p className="text-sm text-red-500">{requestError}</p>}
    </div>
  );
}
