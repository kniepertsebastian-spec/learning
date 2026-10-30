"use client";

import { c_bulkSourceImport } from "@/lib/i18n/components/bulkSourceImport";
import { fill } from "@/lib/i18n/fill";
import { useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { MAX_BULK_SOURCES, parseSourceList, titleFromFileName } from "@/lib/source-list";

type RowState = "waiting" | "running" | "new" | "existing" | "failed";
type Row = { key: string; label: string; state: RowState; message: string | null };

const CONCURRENCY = 3;

const STATE_TEXT: Record<RowState, { de: string; en: string }> = {
  waiting: { de: "wartet", en: "waiting" },
  running: { de: "läuft …", en: "running …" },
  new: { de: "neu", en: "new" },
  existing: { de: "schon vorhanden", en: "already there" },
  failed: { de: "Fehler", en: "failed" },
};

type Task = { key: string; label: string; title: string; url?: string; file?: File };

/**
 * Mehrere Quellen auf einmal hinzufügen: eine Liste von Adressen (eine je Zeile) und/oder mehrere PDF-Dateien, mit
 * gemeinsamem Anbieter und Datum. Jede Quelle geht über denselben Weg wie das Einzel-Hinzufügen (`POST /api/admin/sources`),
 * je drei gleichzeitig; auf Wunsch wird der Text gleich extrahiert. Fehler einer Quelle stoppen die anderen nicht.
 */
export function BulkSourceImport({ certificationId, locale, online, onDone }: { certificationId: string; locale: "de" | "en"; online: boolean; onDone: () => void | Promise<void> }) {
  const de = locale === "de";
  const [provider, setProvider] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [urlText, setUrlText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [autoParse, setAutoParse] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = parseSourceList(urlText);
  const total = parsed.items.length + files.length;
  const tooMany = total > MAX_BULK_SOURCES;

  function setRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function runTask(task: Task) {
    setRow(task.key, { state: "running" });
    try {
      const form = new FormData();
      form.set("certificationId", certificationId);
      form.set("title", task.title);
      form.set("provider", provider.trim());
      if (publishedAt) form.set("publishedAt", publishedAt);
      if (task.file) form.set("file", task.file);
      else form.set("url", task.url ?? "");
      const response = await fetch("/api/admin/sources", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { error?: string; alreadyExisted?: boolean; source?: { id: string; status: string } };
      if (!response.ok || !data.source) {
        setRow(task.key, { state: "failed", message: data.error ?? `Status ${response.status}` });
        return;
      }
      const state: RowState = data.alreadyExisted ? "existing" : "new";
      if (autoParse && (data.source.status === "uploaded" || data.source.status === "failed")) {
        const parse = await fetch(`/api/admin/sources/${data.source.id}/parse`, { method: "POST" });
        const parseData = (await parse.json().catch(() => ({}))) as { error?: string };
        setRow(task.key, { state, message: parse.ok ? (c_bulkSourceImport(de).textExtracted) : `${c_bulkSourceImport(de).textNotExtracted}: ${parseData.error ?? parse.status}` });
        return;
      }
      setRow(task.key, { state, message: null });
    } catch {
      setRow(task.key, { state: "failed", message: c_bulkSourceImport(de).networkError });
    }
  }

  async function start() {
    const tasks: Task[] = [
      ...parsed.items.map((i, n): Task => ({ key: `u${n}`, label: i.url, title: i.title, url: i.url })),
      ...files.map((f, n): Task => ({ key: `f${n}`, label: f.name, title: titleFromFileName(f.name), file: f })),
    ];
    if (tasks.length === 0 || tooMany || !provider.trim()) return;
    setRunning(true);
    setRows(tasks.map((t) => ({ key: t.key, label: t.label, state: "waiting", message: null })));
    const queue = [...tasks];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let task = queue.shift(); task; task = queue.shift()) await runTask(task);
      }),
    );
    setRunning(false);
    setUrlText("");
    setFiles([]);
    if (fileInput.current) fileInput.current.value = "";
    await onDone();
  }

  const counts = { new: 0, existing: 0, failed: 0 };
  for (const r of rows) if (r.state === "new" || r.state === "existing" || r.state === "failed") counts[r.state]++;
  const finished = rows.length > 0 && !running;

  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="bulk-sources">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{c_bulkSourceImport(de).providerForAll}</span>
        <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="CompTIA" disabled={running} data-testid="bulk-provider" className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{c_bulkSourceImport(de).publishedDateOptionalForAll}</span>
        <input type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} disabled={running} className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-medium">{c_bulkSourceImport(de).urlsOnePerLine}</span>
        <textarea
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          rows={6}
          disabled={running}
          data-testid="bulk-urls"
          placeholder={"https://example.org/exam-guide.pdf\nPrüfungsleitfaden | https://example.org/objectives.pdf"}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <span className="mt-1 block text-xs text-subtle">
          {c_bulkSourceImport(de).optionallyWithATitleTitle}
        </span>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-medium">{c_bulkSourceImport(de).pdfFilesMultipleAllowed}</span>
        <input ref={fileInput} type="file" accept="application/pdf" multiple disabled={running} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} data-testid="bulk-files" className="w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={autoParse} onChange={(e) => setAutoParse(e.target.checked)} disabled={running} />
        {c_bulkSourceImport(de).extractTextRightAway}
      </label>

      <div className="text-sm sm:col-span-2" role="status" data-testid="bulk-summary">
        {fill(c_bulkSourceImport(de).n0SourceSFound, total)}
        {parsed.duplicates > 0 ? (fill(c_bulkSourceImport(de).n0DuplicateUrlSIgnored, parsed.duplicates)) : ""}
        {parsed.invalid.length > 0 && <span className="text-danger-text">{fill(c_bulkSourceImport(de).n0InvalidLineS1, parsed.invalid.length, parsed.invalid.slice(0, 3).join(" · "), parsed.invalid.length > 3 ? " …" : "")}</span>}
        {tooMany && <span className="text-danger-text">{fill(c_bulkSourceImport(de).atMost0AtOnce, MAX_BULK_SOURCES)}</span>}
      </div>

      <button
        type="button"
        onClick={() => void start()}
        disabled={running || !online || total === 0 || tooMany || !provider.trim()}
        data-testid="bulk-start"
        className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="h-4 w-4" aria-hidden="true" />}
        {de ? `${total || ""} Quelle(n) hinzufügen`.trim() : `Add ${total || ""} source(s)`.trim()}
      </button>

      {rows.length > 0 && (
        <div className="sm:col-span-2" data-testid="bulk-results">
          {finished && (
            <p className="mb-2 text-sm font-medium" role="status">
              {fill(c_bulkSourceImport(de).done0New1Already, counts.new, counts.existing, counts.failed)}
            </p>
          )}
          <ul className="max-h-72 overflow-y-auto rounded-md border border-border text-xs">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-baseline gap-x-2 border-b border-border-subtle px-3 py-1.5 last:border-b-0">
                <span className="min-w-0 flex-1 break-all">{r.label}</span>
                <span className={r.state === "failed" ? "text-danger-text" : r.state === "new" ? "text-mint-text" : "text-subtle"}>{STATE_TEXT[r.state][locale]}</span>
                {r.message && <span className={r.state === "failed" ? "basis-full text-danger-text" : "basis-full text-subtle"}>{r.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
