"use client";

import { c_markdownSourceEditor } from "@/lib/i18n/components/markdownSourceEditor";
import { fill } from "@/lib/i18n/fill";
import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";

interface SourceResponse {
  error?: string;
  content?: string;
  editable?: boolean;
  source?: { title: string };
  contentChanged?: boolean;
  blueprintDraftExists?: boolean;
  extractionError?: string | null;
}

/**
 * Titel und Text einer Markdown-Quelle nachträglich bearbeiten (nur solange die Quelle noch nicht geprüft oder freigegeben ist -
 * das entscheidet der Server, die Liste zeigt den Knopf nur dafür). Lädt den gespeicherten Text erst beim Öffnen, speichert über
 * `PATCH /api/admin/sources/:id` und meldet danach, ob der Text neu ausgelesen wurde und ob ein Blueprint-Vorschlag veraltet ist.
 */
export function MarkdownSourceEditor({
  sourceId,
  title,
  locale,
  online,
  onSaved,
}: {
  sourceId: string;
  title: string;
  locale: "de" | "en";
  online: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const t = c_markdownSourceEditor(locale);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState<{ title: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);

  async function openEditor() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/sources/${sourceId}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as SourceResponse;
      if (!response.ok || data.content === undefined) throw new Error(data.error ?? t.loadFailed);
      if (data.editable === false) throw new Error(t.notEditable);
      setDraftTitle(data.source?.title ?? title);
      setContent(data.content);
      setLoaded({ title: data.source?.title ?? title, content: data.content });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
      setLoaded(null);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!loaded) return;
    setSaving(true);
    setError(null);
    try {
      // Nur Geändertes senden: ein reiner Titelwechsel liest den Text nicht neu aus.
      const body: { title?: string; content?: string } = {};
      if (draftTitle.trim() !== loaded.title) body.title = draftTitle;
      if (content !== loaded.content) body.content = content;
      const response = await fetch(`/api/admin/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as SourceResponse;
      if (!response.ok) throw new Error(data.error ?? t.saveFailed);

      if (data.contentChanged) {
        const base = data.extractionError ? fill(t.savedButReadFailed, data.extractionError) : t.savedAndRead;
        setNotice({ text: base + (data.blueprintDraftExists ? t.draftIsOutdated : ""), failed: Boolean(data.extractionError) });
      } else {
        setNotice({ text: t.savedTitle, failed: false });
      }
      setOpen(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  const dirty = loaded !== null && (draftTitle.trim() !== loaded.title || content !== loaded.content);
  const canSave = dirty && draftTitle.trim().length > 0 && content.trim().length > 0 && !saving && online;

  return (
    <div className="mt-3">
      {!open && (
        <button
          type="button"
          onClick={() => void openEditor()}
          disabled={!online}
          data-testid={`edit-markdown-${sourceId}`}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          {t.edit}
        </button>
      )}

      {notice && !open && (
        <p role="status" data-testid="markdown-save-notice" className={`mt-2 text-xs ${notice.failed ? "text-danger-text" : "text-success-text"}`}>
          {notice.text}
        </p>
      )}

      {open && (
        <form
          className="flex flex-col gap-3 rounded-md border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) void save();
          }}
        >
          {loading && (
            <p className="flex items-center gap-1.5 text-xs text-subtle" role="status">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {t.loading}
            </p>
          )}
          {loaded && (
            <>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t.title}</span>
                <input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  maxLength={300}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t.text}</span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={18}
                  spellCheck={false}
                  data-testid="markdown-source-text"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
                />
              </label>
              <p className="text-xs text-subtle">{t.saveHint}</p>
            </>
          )}
          {error && (
            <p className="text-sm text-danger-text" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            {loaded && (
              <button
                type="submit"
                disabled={!canSave}
                data-testid="markdown-save"
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                {t.save}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
