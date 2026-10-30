"use client";

import { c_sourcesManager } from "@/lib/i18n/components/sourcesManager";
import { fill } from "@/lib/i18n/fill";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link as LinkIcon, Loader2, UploadCloud } from "lucide-react";
import { BlueprintPanel } from "./BlueprintPanel";
import { BulkSourceImport } from "./BulkSourceImport";
import { useOnlineStatus } from "@/lib/client/use-online-status";

interface Source {
  id: string;
  title: string;
  provider: string;
  status: string;
  sourceType: string;
  sourceUrl: string | null;
  fileSizeBytes: number;
  publishedAt: string | Date | null;
  retrievedAt: string | Date;
  parseError: string | null;
  chunkCount: number;
}

const STATUS_LABEL: Record<string, { de: string; en: string }> = {
  uploaded: { de: "Hochgeladen", en: "Uploaded" },
  parsed: { de: "Text extrahiert", en: "Text extracted" },
  reviewed: { de: "Geprüft", en: "Reviewed" },
  approved: { de: "Freigegeben", en: "Approved" },
  superseded: { de: "Ersetzt", en: "Superseded" },
  failed: { de: "Fehlgeschlagen", en: "Failed" },
};

const STATUS_COLOR: Record<string, string> = {
  uploaded: "bg-warning-soft text-warning-text",
  parsed: "bg-success-soft text-success-text",
  reviewed: "bg-info-soft text-info-text",
  approved: "bg-success-soft text-success-text",
  superseded: "bg-foreground/10 text-subtle",
  failed: "bg-danger-soft text-danger-text",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourcesManager({
  certificationId,
  certificationSlug,
  locale,
  initialSources,
}: {
  certificationId: string;
  certificationSlug: string;
  locale: "de" | "en";
  initialSources: Source[];
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [sourceKind, setSourceKind] = useState<"pdf" | "url">("pdf");
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [parsingAll, setParsingAll] = useState<{ done: number; total: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approvedSources = sources.filter((s) => s.status === "approved");

  async function refresh() {
    const response = await fetch(
      `/api/admin/sources?certificationId=${encodeURIComponent(certificationId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const data = (await response.json()) as { sources: Source[] };
    setSources(data.sources);
  }

  async function handleUpload(formData: FormData) {
    setUploading(true);
    setError(null);
    try {
      formData.set("certificationId", certificationId);
      const response = await fetch("/api/admin/sources", { method: "POST", body: formData });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Status ${response.status}`);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : c_sourcesManager(locale).uploadFailed,
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleParse(sourceId: string) {
    setParsingId(sourceId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sources/${sourceId}/parse`, { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Status ${response.status}`);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : c_sourcesManager(locale).extractionFailed,
      );
      await refresh();
    } finally {
      setParsingId(null);
    }
  }

  /** Text aller noch nicht (oder fehlgeschlagen) extrahierten Quellen nacheinander extrahieren. */
  async function handleParseAll() {
    const todo = sources.filter((s) => s.status === "uploaded" || s.status === "failed");
    if (todo.length === 0) return;
    setError(null);
    let failed = 0;
    for (const [i, source] of todo.entries()) {
      setParsingAll({ done: i, total: todo.length });
      const response = await fetch(`/api/admin/sources/${source.id}/parse`, { method: "POST" }).catch(() => null);
      if (!response?.ok) failed++;
    }
    setParsingAll(null);
    if (failed > 0) setError(fill(c_sourcesManager(locale).n0Of1SourcesCould, failed, todo.length));
    await refresh();
  }

  const pendingExtraction = sources.filter((s) => s.status === "uploaded" || s.status === "failed").length;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{c_sourcesManager(locale).addSource}</h2>
          <div className="flex gap-1 rounded-md border border-border p-0.5" role="group" aria-label={c_sourcesManager(locale).howToAdd}>
            {(["single", "bulk"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={addMode === m}
                onClick={() => setAddMode(m)}
                data-testid={`add-mode-${m}`}
                className={`rounded px-2.5 py-1 text-xs font-medium ${addMode === m ? "bg-primary text-on-primary" : "hover:bg-background"}`}
              >
                {m === "single" ? (c_sourcesManager(locale).single) : c_sourcesManager(locale).manyAtOnce}
              </button>
            ))}
          </div>
        </div>
        {addMode === "bulk" && <BulkSourceImport certificationId={certificationId} locale={locale} online={online} onDone={async () => { await refresh(); router.refresh(); }} />}
        {addMode === "single" && <form
          action={(formData) => void handleUpload(formData)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium">{c_sourcesManager(locale).title}</span>
            <input
              name="title"
              required
              placeholder={c_sourcesManager(locale).eGSy0701Exam}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium">{c_sourcesManager(locale).provider}</span>
            <input
              name="provider"
              required
              placeholder="CompTIA"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium">
              {c_sourcesManager(locale).publishedDateOptional}
            </span>
            <input
              name="publishedAt"
              type="date"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <div className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium">
              {c_sourcesManager(locale).source}
            </span>
            <div className="mb-2 flex gap-1 rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => setSourceKind("pdf")}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                  sourceKind === "pdf" ? "bg-primary text-on-primary" : "hover:bg-background"
                }`}
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => setSourceKind("url")}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                  sourceKind === "url" ? "bg-primary text-on-primary" : "hover:bg-background"
                }`}
              >
                URL
              </button>
            </div>
            {sourceKind === "pdf" ? (
              <input
                name="file"
                type="file"
                accept="application/pdf"
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            ) : (
              <input
                name="url"
                type="url"
                required
                placeholder="https://example.org/exam-guide.pdf"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            )}
          </div>
          {approvedSources.length > 0 && (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                {c_sourcesManager(locale).supersedesAnApprovedSourceOptional}
              </span>
              <select
                name="supersedesSourceId"
                defaultValue=""
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">{c_sourcesManager(locale).noneNewSource}</option>
                {approvedSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-faint">
                {c_sourcesManager(locale).marksThisAsANew}
              </span>
            </label>
          )}
          <button
            type="submit"
            disabled={uploading || !online}
            className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
            )}
            {c_sourcesManager(locale).upload}
          </button>
        </form>}
        {/* R4.4 (roadmap.md): "Quellenimport ausdrücklich nicht offline anbieten". */}
        {!online && (
          <p className="mt-3 text-xs text-warning-text dark:text-warning-text">
            {c_sourcesManager(locale).sourceImportRequiresAConnection}
          </p>
        )}
        {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{c_sourcesManager(locale).existingSources}</h2>
          {pendingExtraction > 0 && (
            <button
              type="button"
              onClick={() => void handleParseAll()}
              disabled={parsingAll !== null || !online}
              data-testid="parse-all"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              {parsingAll && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
              {parsingAll
                ? fill(c_sourcesManager(locale).extracting0Of1, parsingAll.done + 1, parsingAll.total)
                : fill(c_sourcesManager(locale).extractAll0Pending, pendingExtraction)}
            </button>
          )}
        </div>
        {sources.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
            <p className="text-sm text-muted">
              {c_sourcesManager(locale).noSourcesUploadedYet}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sources.map((source) => {
              const statusLabel = STATUS_LABEL[source.status]?.[locale] ?? source.status;
              const statusColor = STATUS_COLOR[source.status] ?? "bg-foreground/10 text-subtle";
              const isParsing = parsingId === source.id;
              const textExtracted = ["parsed", "reviewed", "approved"].includes(source.status);
              return (
                <div key={source.id} className="rounded-2xl border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {source.sourceType === "url" ? (
                        <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                      ) : (
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                      )}
                      <div>
                        <p className="font-medium">{source.title}</p>
                        <p className="text-xs text-subtle">
                          {source.provider} · {formatBytes(source.fileSizeBytes)}
                          {textExtracted
                            ? ` · ${source.chunkCount} ${c_sourcesManager(locale).pagesExtracted}`
                            : ""}
                        </p>
                        {source.sourceType === "url" && source.sourceUrl && (
                          <a
                            href={source.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-link hover:underline"
                          >
                            {source.sourceUrl}
                          </a>
                        )}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {source.status === "failed" && source.parseError && (
                    <p className="mt-2 whitespace-pre-wrap rounded-md bg-danger-soft p-2 text-xs text-danger-text">
                      {source.parseError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleParse(source.id)}
                    disabled={isParsing}
                    className="mt-3 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isParsing && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    {source.status === "uploaded" || source.status === "failed"
                      ? c_sourcesManager(locale).extractText
                      : c_sourcesManager(locale).reExtract}
                  </button>

                  {textExtracted && (
                    <BlueprintPanel
                      sourceId={source.id}
                      certificationSlug={certificationSlug}
                      sourceStatus={source.status}
                      locale={locale}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
