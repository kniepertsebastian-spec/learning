"use client";

import { c_documentsPanel } from "@/lib/i18n/components/documentsPanel";
import { fill } from "@/lib/i18n/fill";
import { useRef, useState } from "react";
import { FileDropZone } from "@/components/FileDropZone";
import { useRouter } from "next/navigation";
import { SECRET_KIND_LABELS, type SecretKind } from "@/lib/server/documents/secret-scanner";

export type DocumentRowView = {
  id: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  excludeFromAi: boolean;
  suppressedFindings: number;
  createdAt: string;
  uploadedByName: string | null;
  imageCount: number;
};

type Finding = { kind: SecretKind; pageNumber: number; line: number; suppressible: boolean };

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type ImageRow = { id: string; filename: string; sizeBytes: number };

/** Screenshots eines Dokuments: anhängen (mit Bestätigung, dass nichts Vertrauliches zu sehen ist), ansehen, löschen. */
function DocumentImages({ documentId, count, de }: { documentId: string; count: number; de: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/company/documents/${documentId}/images`);
    if (res.ok) setImages((await res.json()).images);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const files = [...(fileRef.current?.files ?? [])];
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    for (const file of files) {
      const form = new FormData();
      form.set("file", file);
      form.set("attest", String(attest));
      const res = await fetch(`/api/company/documents/${documentId}/images`, { method: "POST", body: form });
      if (!res.ok) {
        setError(`${file.name}: ${(await res.json().catch(() => null))?.error ?? (c_documentsPanel(de).uploadFailed)}`);
        break;
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    await load();
    router.refresh();
  }

  async function remove(imageId: string) {
    await fetch(`/api/company/documents/${documentId}/images/${imageId}`, { method: "DELETE" });
    await load();
    router.refresh();
  }

  return (
    <details className="basis-full text-xs" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void load(); }} data-testid="document-images">
      <summary className="cursor-pointer text-link">
        {fill(c_documentsPanel(de).screenshots0, count)}
      </summary>
      <div className="mt-2 flex flex-col gap-2 rounded-md border border-border p-3">
        <p className="text-muted">
          {c_documentsPanel(de).pngJpegOrWebpUp}
        </p>
        {images.length > 0 && (
          <ul className="divide-y divide-border">
            {images.map((img) => (
              <li key={img.id} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 break-all">{img.filename} · {formatSize(img.sizeBytes)}</span>
                <button type="button" onClick={() => void remove(img.id)} className="text-danger-text hover:underline">
                  {c_documentsPanel(de).remove}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2">
          <input ref={fileRef} type="file" multiple required accept=".png,.jpg,.jpeg,.webp" aria-label={c_documentsPanel(de).screenshots} />
          <label className="flex min-h-11 items-start gap-2">
            <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5" />
            <span>
              {c_documentsPanel(de).theImagesShowNoPasswords}
            </span>
          </label>
          <div>
            <button type="submit" disabled={busy || !attest} className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-background disabled:opacity-50">
              {busy ? (c_documentsPanel(de).uploading) : c_documentsPanel(de).attachScreenshots}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-danger-text">
              {error}
            </p>
          )}
        </form>
      </div>
    </details>
  );
}

/** Firmendokumente: hochladen (mit Prüfung auf Zugangsdaten), herunterladen, löschen. */
export function DocumentsPanel({
  documents,
  locale,
  canSuppress,
}: {
  documents: DocumentRowView[];
  locale: "de" | "en";
  /** Firmen-Admins dürfen Fehlalarme des Scanners bestätigen. */
  canSuppress: boolean;
}) {
  const router = useRouter();
  const de = locale === "de";
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [excludeFromAi, setExcludeFromAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(e: React.FormEvent, suppressKinds: SecretKind[] = []) {
    e.preventDefault();
    const file = files[0];
    if (!file) return;
    setPending(true);
    setError(null);
    setFindings([]);
    setNotice(null);
    const form = new FormData();
    form.set("file", file);
    if (title.trim()) form.set("title", title.trim());
    form.set("excludeFromAi", String(excludeFromAi));
    for (const kind of suppressKinds) form.append("suppressKinds", kind);
    const res = await fetch("/api/company/documents", { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(body?.error ?? (c_documentsPanel(de).uploadFailed));
      if (body?.code === "secrets_found") setFindings(body.findings as Finding[]);
      return;
    }
    setNotice(
      body.alreadyExisted
        ? c_documentsPanel(de).thisDocumentAlreadyExists
        : c_documentsPanel(de).documentSaved,
    );
    setTitle("");
    setExcludeFromAi(false);
    setFiles([]);
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/company/documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(c_documentsPanel(de).couldNotDelete);
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="documents-panel">
      <h2 className="text-lg font-medium">{c_documentsPanel(de).companyDocuments}</h2>
      <p className="mt-1 text-sm text-muted">
        {c_documentsPanel(de).pdfTextFileTxtMd}
      </p>

      <form onSubmit={(e) => void upload(e)} className="mt-4 flex flex-col gap-3">
        <FileDropZone files={files} onChange={setFiles} locale={locale} maxFiles={1} maxBytes={10 * 1024 * 1024} disabled={pending} testId="documents-drop" />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={c_documentsPanel(de).titleOptionalDefaultsToThe}
          aria-label={c_documentsPanel(de).title}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={excludeFromAi} onChange={(e) => setExcludeFromAi(e.target.checked)} />
          {c_documentsPanel(de).doNotLetAiProcess}
        </label>
        <div>
          <button
            type="submit"
            disabled={pending || files.length === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
            data-testid="documents-upload"
          >
            {pending ? (c_documentsPanel(de).checking) : c_documentsPanel(de).upload}
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text" data-testid="upload-error">
          <p>{error}</p>
          {findings.length > 0 && (
            <ul className="mt-2 list-disc pl-5" data-testid="upload-findings">
              {findings.map((f, i) => (
                <li key={i}>
                  {SECRET_KIND_LABELS[f.kind]?.[locale] ?? f.kind} – {c_documentsPanel(de).page} {f.pageNumber}, {c_documentsPanel(de).line} {f.line}
                </li>
              ))}
            </ul>
          )}
          {findings.length > 0 && findings.every((f) => f.suppressible) && (
            <div className="mt-3" data-testid="suppress-box">
              {canSuppress ? (
                <>
                  <p className="text-foreground">
                    {c_documentsPanel(de).areTheseExampleValuesRather}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => void upload(e, [...new Set(findings.map((f) => f.kind))])}
                    disabled={pending}
                    className="mt-2 rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger-text hover:bg-danger-soft disabled:opacity-50"
                  >
                    {c_documentsPanel(de).confirmAsHarmlessAndUpload}
                  </button>
                </>
              ) : (
                <p className="text-foreground">{c_documentsPanel(de).aCompanyAdminCanConfirm}</p>
              )}
            </div>
          )}
          {findings.some((f) => !f.suppressible) && (
            <p className="mt-2 text-foreground" data-testid="not-suppressible">
              {c_documentsPanel(de).atLeastOneFindingCannot}
            </p>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm" data-testid="upload-notice">
          {notice}
        </p>
      )}

      <h3 className="mt-6 text-base font-medium">{c_documentsPanel(de).uploaded}</h3>
      {documents.length === 0 ? (
        <p className="mt-2 text-sm text-muted" data-testid="documents-empty">
          {c_documentsPanel(de).noDocumentsYet}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border" data-testid="documents-list">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="document-row">
              <span>
                <span className="font-medium">{d.title}</span>
                <span className="ml-2 text-xs text-muted">
                  {d.originalFilename} · {formatSize(d.sizeBytes)} · {d.pageCount} {de ? (d.pageCount === 1 ? "Seite" : "Seiten") : d.pageCount === 1 ? "page" : "pages"}
                  {d.excludeFromAi ? (c_documentsPanel(de).noAi) : ""}
                  {d.suppressedFindings > 0 ? (fill(c_documentsPanel(de).n0ScannerFindingsConfirmed, d.suppressedFindings)) : ""}
                </span>
              </span>
              <span className="flex gap-3">
                <a href={`/api/company/documents/${d.id}/download`} className="text-xs text-link hover:underline">
                  {c_documentsPanel(de).download}
                </a>
                <button type="button" onClick={() => void remove(d.id)} className="text-xs text-danger-text hover:underline">
                  {c_documentsPanel(de).delete}
                </button>
              </span>
              <DocumentImages documentId={d.id} count={d.imageCount} de={de} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
