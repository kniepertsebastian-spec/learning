"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, UploadCloud } from "lucide-react";

interface Source {
  id: string;
  title: string;
  provider: string;
  status: string;
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
  uploaded: "bg-yellow-500/10 text-yellow-600",
  parsed: "bg-green-500/10 text-green-600",
  reviewed: "bg-blue-500/10 text-blue-600",
  approved: "bg-green-500/10 text-green-600",
  superseded: "bg-foreground/10 text-foreground/60",
  failed: "bg-red-500/10 text-red-600",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourcesManager({
  certificationId,
  locale,
  initialSources,
}: {
  certificationId: string;
  locale: "de" | "en";
  initialSources: Source[];
}) {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [uploading, setUploading] = useState(false);
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          : locale === "de" ? "Upload fehlgeschlagen." : "Upload failed.",
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
          : locale === "de" ? "Extraktion fehlgeschlagen." : "Extraction failed.",
      );
      await refresh();
    } finally {
      setParsingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 font-medium">
          {locale === "de" ? "Quelle hochladen" : "Upload source"}
        </h2>
        <form
          action={(formData) => void handleUpload(formData)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium">{locale === "de" ? "Titel" : "Title"}</span>
            <input
              name="title"
              required
              placeholder={locale === "de" ? "z. B. SY0-701 Exam Objectives" : "e.g. SY0-701 Exam Objectives"}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium">{locale === "de" ? "Anbieter" : "Provider"}</span>
            <input
              name="provider"
              required
              placeholder="CompTIA"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium">
              {locale === "de" ? "Veröffentlichungsdatum (optional)" : "Published date (optional)"}
            </span>
            <input
              name="publishedAt"
              type="date"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block font-medium">PDF</span>
            <input
              name="file"
              type="file"
              accept="application/pdf"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
            )}
            {locale === "de" ? "Hochladen" : "Upload"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 font-medium">
          {locale === "de" ? "Vorhandene Quellen" : "Existing sources"}
        </h2>
        {sources.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
            <p className="text-sm text-foreground/70">
              {locale === "de" ? "Noch keine Quellen hochgeladen." : "No sources uploaded yet."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sources.map((source) => {
              const statusLabel = STATUS_LABEL[source.status]?.[locale] ?? source.status;
              const statusColor = STATUS_COLOR[source.status] ?? "bg-foreground/10 text-foreground/60";
              const isParsing = parsingId === source.id;
              return (
                <div key={source.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" aria-hidden="true" />
                      <div>
                        <p className="font-medium">{source.title}</p>
                        <p className="text-xs text-foreground/60">
                          {source.provider} · {formatBytes(source.fileSizeBytes)}
                          {source.status === "parsed" || source.status === "reviewed" || source.status === "approved"
                            ? ` · ${source.chunkCount} ${locale === "de" ? "Seiten extrahiert" : "pages extracted"}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {source.status === "failed" && source.parseError && (
                    <p className="mt-2 whitespace-pre-wrap rounded-md bg-red-500/10 p-2 text-xs text-red-600">
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
                      ? locale === "de" ? "Text extrahieren" : "Extract text"
                      : locale === "de" ? "Erneut extrahieren" : "Re-extract"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
