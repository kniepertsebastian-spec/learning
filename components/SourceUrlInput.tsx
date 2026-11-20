"use client";

import { c_sourceUrlInput } from "@/lib/i18n/components/sourceUrlInput";
import { fill } from "@/lib/i18n/fill";
import { useEffect, useRef, useState } from "react";
import { FileText, Link2, Loader2, Upload, X } from "lucide-react";
import { describeUrl, extractUrls } from "@/lib/client/extract-urls";
import { isUploadRef } from "@/lib/course-generation/source-refs";
import { DOCUMENT_ACCEPT, isAcceptedDocumentName } from "@/lib/documents/file-types";

/** Lädt eine Datei hoch und liefert den Verweis (`upload:<id>`), der in die Quellenliste kommt. */
export type SourceFileUploader = (file: File) => Promise<{ ref: string; filename: string }>;

/**
 * Quellen als „Bundle“: Beliebigen Text mit Adressen einfügen (Liste, Mail, Markdown, Komma-getrennt); jede Adresse wird von
 * Anfang bis Ende erkannt und als Karte (Domain + Seitenname) abgelegt, Doppelte fallen weg. Einzeln entfernbar, mit Zähler.
 * Mit `uploadFile` lassen sich in dieselbe Liste auch Dateien legen (Knopf oder Drag and drop); sie stehen dort als
 * `upload:<id>`, `labels` liefert ihre Dateinamen. Gesendet wird ein verstecktes Feld `name` mit einer Quelle pro Zeile.
 */
export function SourceUrlInput({
  urls,
  onChange,
  locale,
  max,
  name = "sourceUrls",
  uploadFile,
  labels = {},
  onLabel,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  locale: "de" | "en";
  max: number;
  name?: string;
  uploadFile?: SourceFileUploader;
  labels?: Record<string, string>;
  onLabel?: (ref: string, filename: string) => void;
}) {
  const de = locale === "de";
  const t = c_sourceUrlInput(de);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Die Liste ändert sich während mehrerer Uploads; der jeweils neueste Stand liegt hier.
  const latest = useRef(urls);
  useEffect(() => {
    latest.current = urls;
  }, [urls]);

  function absorb(text: string): boolean {
    const found = extractUrls(text);
    if (found.length === 0) return false;
    const fresh = found.filter((u) => !urls.includes(u));
    const room = Math.max(0, max - urls.length);
    onChange([...urls, ...fresh.slice(0, room)]);
    const notes: string[] = [];
    if (found.length > fresh.length) notes.push(fill(t.n0AlreadyAdded, found.length - fresh.length));
    if (fresh.length > room) notes.push(fill(t.n0NotAddedMax1, fresh.length - room, max));
    setNotice(notes.length ? notes.join(" · ") : null);
    return true;
  }

  async function addFiles(files: File[]) {
    if (!uploadFile || files.length === 0) return;
    const notes: string[] = [];
    const room = Math.max(0, max - latest.current.length - uploading);
    const accepted = files.filter((f) => {
      if (isAcceptedDocumentName(f.name)) return true;
      notes.push(fill(t.uploadFailed, f.name, t.typeNotAllowed));
      return false;
    });
    if (accepted.length > room) notes.push(fill(t.n0NotAddedMax1, accepted.length - room, max));
    const batch = accepted.slice(0, room);
    setNotice(notes.length ? notes.join(" · ") : null);
    setUploading((n) => n + batch.length);
    for (const file of batch) {
      try {
        const { ref, filename } = await uploadFile(file);
        onLabel?.(ref, filename);
        if (!latest.current.includes(ref)) {
          latest.current = [...latest.current, ref];
          onChange(latest.current);
        }
      } catch (error) {
        notes.push(fill(t.uploadFailed, file.name, error instanceof Error ? error.message : String(error)));
        setNotice(notes.join(" · "));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  return (
    <div
      data-testid="source-urls"
      onDragOver={uploadFile ? (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } } : undefined}
      onDragLeave={uploadFile ? () => setDragOver(false) : undefined}
      onDrop={uploadFile ? (e) => { if (e.dataTransfer.files.length > 0) { e.preventDefault(); setDragOver(false); void addFiles(Array.from(e.dataTransfer.files)); } } : undefined}
      className={dragOver ? "rounded-md outline-2 outline-dashed outline-accent" : undefined}
    >
      <input type="hidden" name={name} value={urls.join("\n")} />
      <textarea
        value={draft}
        rows={2}
        data-testid="source-urls-draft"
        placeholder={t.pasteAddressesHereOneOr}
        onChange={(e) => setDraft(e.target.value)}
        onPaste={(e) => {
          if (uploadFile && e.clipboardData.files.length > 0) {
            e.preventDefault();
            void addFiles(Array.from(e.clipboardData.files));
            return;
          }
          const text = e.clipboardData.getData("text");
          if (absorb(text)) {
            e.preventDefault();
            setDraft("");
          }
        }}
        onBlur={() => {
          if (draft.trim() && absorb(draft)) setDraft("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
            e.preventDefault();
            if (absorb(draft)) setDraft("");
            else setNotice(t.noValidAddressFoundStart);
          }
        }}
        className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
      />
      {uploadFile && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={DOCUMENT_ACCEPT}
            className="sr-only"
            data-testid="source-files-input"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={urls.length + uploading >= max}
            data-testid="source-files-add"
            className="flex items-center gap-1.5 rounded-md border border-border-strong bg-control px-2.5 py-1.5 font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {t.addFiles}
          </button>
          <span>{t.filesHint}</span>
          {uploading > 0 && (
            <span className="flex items-center gap-1" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t.uploading}
            </span>
          )}
        </div>
      )}
      {notice && <p className="mt-1 text-xs text-warning-text" role="status" data-testid="source-urls-notice">{notice}</p>}
      <p className="mt-1 text-xs text-subtle" data-testid="source-urls-count">
        {fill(t.n0Of1Sources, urls.length, max)}
        {urls.length > 0 && (
          <button type="button" className="ml-2 underline" onClick={() => onChange([])}>{t.clearAll}</button>
        )}
      </p>
      {urls.length > 0 && (
        <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto" data-testid="source-urls-list">
          {urls.map((url) => {
            const file = isUploadRef(url);
            const d = file ? { host: labels[url] ?? t.uploadedFile, path: t.uploadedFile } : describeUrl(url);
            const Icon = file ? FileText : Link2;
            return (
              <li key={url} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs" data-kind={file ? "file" : "link"}>
                <Icon className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1" title={file ? labels[url] : url}>
                  <span className="block truncate font-medium">{d.host}</span>
                  {d.path && <span className="block truncate text-subtle">{d.path}</span>}
                </span>
                <button type="button" aria-label={t.removeSource} onClick={() => onChange(urls.filter((u) => u !== url))} className="rounded p-1 hover:bg-background">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
