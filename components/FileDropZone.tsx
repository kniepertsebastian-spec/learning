"use client";

import { c_fileDropZone } from "@/lib/i18n/components/fileDropZone";
import { fill } from "@/lib/i18n/fill";
import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { DOCUMENT_ACCEPT, isAcceptedDocumentName } from "@/lib/documents/file-types";

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Fläche zum Ablegen von Dateien (Drag and drop) mit einem sichtbaren Knopf „Dateien auswählen“. Die Auswahl gehört dem
 * Aufrufer (`files`); nicht erlaubte Endungen und zu viele Dateien werden hier abgewiesen und gemeldet.
 */
export function FileDropZone({
  files,
  onChange,
  locale,
  maxFiles = 1,
  maxBytes,
  accept = DOCUMENT_ACCEPT,
  disabled = false,
  testId = "file-drop-zone",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  locale: "de" | "en";
  maxFiles?: number;
  maxBytes?: number;
  accept?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const de = locale === "de";
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const multiple = maxFiles > 1;

  function add(incoming: File[]) {
    setNotice(null);
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of incoming) {
      if (!isAcceptedDocumentName(file.name)) problems.push(fill(c_fileDropZone(de).n0FileTypeNotAllowed, file.name));
      else if (maxBytes && file.size > maxBytes) problems.push(fill(c_fileDropZone(de).n0LargerThan1Mb, file.name, Math.round(maxBytes / (1024 * 1024))));
      else accepted.push(file);
    }
    const merged = multiple ? [...files, ...accepted.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))] : accepted.slice(0, 1);
    if (merged.length > maxFiles) {
      problems.push(fill(c_fileDropZone(de).atMost0FilesThe, maxFiles));
    }
    onChange(merged.slice(0, maxFiles));
    if (problems.length) setNotice(problems.join(" · "));
  }

  return (
    <div data-testid={testId}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) add([...e.dataTransfer.files]);
        }}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ${over ? "border-accent bg-accent-soft" : "border-border"} ${disabled ? "opacity-60" : ""}`}
      >
        <Upload className="h-6 w-6 text-subtle" aria-hidden="true" />
        <p>
          {multiple
            ? c_fileDropZone(de).dragFilesHereOr
            : c_fileDropZone(de).dragAFileHereOr}
        </p>
        <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50" data-testid={`${testId}-pick`}>
          {multiple ? (c_fileDropZone(de).chooseFiles) : c_fileDropZone(de).chooseFile}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          aria-label={c_fileDropZone(de).files}
          data-testid={`${testId}-input`}
          onChange={(e) => {
            add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {notice && (
        <p role="alert" className="mt-2 text-sm text-danger-text" data-testid={`${testId}-notice`}>
          {notice}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm" data-testid={`${testId}-list`}>
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                <span className="min-w-0 break-all">{f.name}</span>
                <span className="shrink-0 text-xs text-subtle">{formatSize(f.size)}</span>
              </span>
              <button type="button" disabled={disabled} onClick={() => onChange(files.filter((x) => x !== f))} className="shrink-0 rounded p-1 hover:bg-background" aria-label={`${f.name} ${c_fileDropZone(de).remove}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
