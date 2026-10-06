"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SECRET_KIND_LABELS, type SecretKind } from "@/lib/server/documents/secret-scanner";

export type DocumentRowView = {
  id: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  excludeFromAi: boolean;
  createdAt: string;
  uploadedByName: string | null;
};

type Finding = { kind: SecretKind; pageNumber: number; line: number };

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Firmendokumente: hochladen (mit Prüfung auf Zugangsdaten), herunterladen, löschen. */
export function DocumentsPanel({ documents, locale }: { documents: DocumentRowView[]; locale: "de" | "en" }) {
  const router = useRouter();
  const de = locale === "de";
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [excludeFromAi, setExcludeFromAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    setFindings([]);
    setNotice(null);
    const form = new FormData();
    form.set("file", file);
    if (title.trim()) form.set("title", title.trim());
    form.set("excludeFromAi", String(excludeFromAi));
    const res = await fetch("/api/company/documents", { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(body?.error ?? (de ? "Upload fehlgeschlagen." : "Upload failed."));
      if (body?.code === "secrets_found") setFindings(body.findings as Finding[]);
      return;
    }
    setNotice(
      body.alreadyExisted
        ? de ? "Dieses Dokument gibt es schon." : "This document already exists."
        : de ? "Dokument gespeichert." : "Document saved.",
    );
    setTitle("");
    setExcludeFromAi(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/company/documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(de ? "Löschen fehlgeschlagen." : "Could not delete.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="documents-panel">
      <h2 className="text-lg font-medium">{de ? "Firmendokumente" : "Company documents"}</h2>
      <p className="mt-1 text-sm text-foreground/70">
        {de
          ? "PDF oder Textdatei (.txt, .md), bis 10 MB. Jedes Dokument wird vor dem Speichern auf Passwörter, Schlüssel und Token geprüft. Wird etwas gefunden, wird das Dokument nicht gespeichert."
          : "PDF or text file (.txt, .md), up to 10 MB. Every document is checked for passwords, keys and tokens before it is stored. If something is found, the document is not stored."}
      </p>

      <form onSubmit={upload} className="mt-4 flex flex-col gap-3">
        <input
          ref={fileRef}
          type="file"
          required
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          aria-label={de ? "Datei" : "File"}
          className="text-sm"
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={de ? "Titel (optional, sonst der Dateiname)" : "Title (optional, defaults to the file name)"}
          aria-label={de ? "Titel" : "Title"}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={excludeFromAi} onChange={(e) => setExcludeFromAi(e.target.checked)} />
          {de ? "Nicht von KI verarbeiten lassen" : "Do not let AI process this document"}
        </label>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? (de ? "Wird geprüft …" : "Checking …") : de ? "Hochladen" : "Upload"}
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500" data-testid="upload-error">
          <p>{error}</p>
          {findings.length > 0 && (
            <ul className="mt-2 list-disc pl-5" data-testid="upload-findings">
              {findings.map((f, i) => (
                <li key={i}>
                  {SECRET_KIND_LABELS[f.kind]?.[locale] ?? f.kind} – {de ? "Seite" : "page"} {f.pageNumber}, {de ? "Zeile" : "line"} {f.line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm" data-testid="upload-notice">
          {notice}
        </p>
      )}

      <h3 className="mt-6 text-base font-medium">{de ? "Hochgeladen" : "Uploaded"}</h3>
      {documents.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/70" data-testid="documents-empty">
          {de ? "Noch keine Dokumente." : "No documents yet."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border" data-testid="documents-list">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="document-row">
              <span>
                <span className="font-medium">{d.title}</span>
                <span className="ml-2 text-xs text-foreground/70">
                  {d.originalFilename} · {formatSize(d.sizeBytes)} · {d.pageCount} {de ? (d.pageCount === 1 ? "Seite" : "Seiten") : d.pageCount === 1 ? "page" : "pages"}
                  {d.excludeFromAi ? (de ? " · ohne KI" : " · no AI") : ""}
                </span>
              </span>
              <span className="flex gap-3">
                <a href={`/api/company/documents/${d.id}/download`} className="text-xs text-accent hover:underline">
                  {de ? "Herunterladen" : "Download"}
                </a>
                <button type="button" onClick={() => void remove(d.id)} className="text-xs text-red-500 hover:underline">
                  {de ? "Löschen" : "Delete"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
