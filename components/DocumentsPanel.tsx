"use client";

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
        setError(`${file.name}: ${(await res.json().catch(() => null))?.error ?? (de ? "Upload fehlgeschlagen." : "Upload failed.")}`);
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
        {de ? `Screenshots (${count})` : `Screenshots (${count})`}
      </summary>
      <div className="mt-2 flex flex-col gap-2 rounded-md border border-border p-3">
        <p className="text-foreground/70">
          {de
            ? "PNG, JPEG oder WebP, bis 4 MB, höchstens 20 je Dokument. Die KI wandelt jeden Screenshot in Text um (Befehle, Konfigurationen, Aufbau) und nutzt ihn für den Kurs. Bilder lassen sich nicht auf Zugangsdaten prüfen."
            : "PNG, JPEG or WebP, up to 4 MB, at most 20 per document. The AI turns each screenshot into text (commands, configuration, layout) and uses it for the course. Images cannot be checked for credentials."}
        </p>
        {images.length > 0 && (
          <ul className="divide-y divide-border">
            {images.map((img) => (
              <li key={img.id} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 break-all">{img.filename} · {formatSize(img.sizeBytes)}</span>
                <button type="button" onClick={() => void remove(img.id)} className="text-red-500 hover:underline">
                  {de ? "Entfernen" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2">
          <input ref={fileRef} type="file" multiple required accept=".png,.jpg,.jpeg,.webp" aria-label={de ? "Screenshots" : "Screenshots"} />
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5" />
            <span>
              {de
                ? "Auf den Bildern sind keine Passwörter, Schlüssel, Tokens oder vertraulichen Kundendaten zu sehen."
                : "The images show no passwords, keys, tokens or confidential customer data."}
            </span>
          </label>
          <div>
            <button type="submit" disabled={busy || !attest} className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-background disabled:opacity-50">
              {busy ? (de ? "Wird hochgeladen …" : "Uploading …") : de ? "Screenshots anhängen" : "Attach screenshots"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-red-500">
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
    setFiles([]);
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
          ? "PDF, Textdatei (.txt, .md), Konfiguration und Skripte (.yml, .yaml, .py, .sh, .sql …) oder Wiki-/Doku-Export (.json, .xml, .html, z. B. Wiki.js, MediaWiki), bis 10 MB. Listen, Tabellen, Befehle und Stichwörter sind in Ordnung. Jedes Dokument wird vor dem Speichern auf Passwörter, Schlüssel und Token geprüft. Wird etwas gefunden, wird das Dokument nicht gespeichert."
          : "PDF, text file (.txt, .md), configuration and scripts (.yml, .yaml, .py, .sh, .sql …) or wiki/docs export (.json, .xml, .html, e.g. Wiki.js, MediaWiki), up to 10 MB. Lists, tables, commands and keywords are fine. Every document is checked for passwords, keys and tokens before it is stored. If something is found, the document is not stored."}
      </p>

      <form onSubmit={(e) => void upload(e)} className="mt-4 flex flex-col gap-3">
        <FileDropZone files={files} onChange={setFiles} locale={locale} maxFiles={1} maxBytes={10 * 1024 * 1024} disabled={pending} testId="documents-drop" />
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
            disabled={pending || files.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
            data-testid="documents-upload"
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
          {findings.length > 0 && findings.every((f) => f.suppressible) && (
            <div className="mt-3" data-testid="suppress-box">
              {canSuppress ? (
                <>
                  <p className="text-foreground">
                    {de
                      ? "Sind das Beispielwerte und keine echten Zugangsdaten? Dann kannst du diese Funde als unkritisch bestätigen. Das wird protokolliert, die Stellen werden gespeichert und bei einer KI-Verarbeitung geschwärzt."
                      : "Are these example values rather than real credentials? Then you can confirm these findings as harmless. This is logged, the locations are stored and will be redacted from any AI processing."}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => void upload(e, [...new Set(findings.map((f) => f.kind))])}
                    disabled={pending}
                    className="mt-2 rounded-md border border-red-500 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {de ? "Als unkritisch bestätigen und hochladen" : "Confirm as harmless and upload"}
                  </button>
                </>
              ) : (
                <p className="text-foreground">{de ? "Ein Firmen-Admin kann diese Funde als unkritisch bestätigen." : "A company admin can confirm these findings as harmless."}</p>
              )}
            </div>
          )}
          {findings.some((f) => !f.suppressible) && (
            <p className="mt-2 text-foreground" data-testid="not-suppressible">
              {de ? "Mindestens ein Fund lässt sich nicht bestätigen (z. B. privater Schlüssel oder Token). Bitte die Stelle entfernen." : "At least one finding cannot be confirmed (e.g. private key or token). Please remove that part."}
            </p>
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
                  {d.suppressedFindings > 0 ? (de ? ` · ${d.suppressedFindings} Scanner-Funde bestätigt` : ` · ${d.suppressedFindings} scanner findings confirmed`) : ""}
                </span>
              </span>
              <span className="flex gap-3">
                <a href={`/api/company/documents/${d.id}/download`} className="text-xs text-link hover:underline">
                  {de ? "Herunterladen" : "Download"}
                </a>
                <button type="button" onClick={() => void remove(d.id)} className="text-xs text-red-500 hover:underline">
                  {de ? "Löschen" : "Delete"}
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
