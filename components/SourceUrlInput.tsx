"use client";

import { c_sourceUrlInput } from "@/lib/i18n/components/sourceUrlInput";
import { fill } from "@/lib/i18n/fill";
import { useState } from "react";
import { Link2, X } from "lucide-react";
import { describeUrl, extractUrls } from "@/lib/client/extract-urls";

/**
 * Quellen als „Bundle“: Beliebigen Text mit Adressen einfügen (Liste, Mail, Markdown, Komma-getrennt); jede Adresse wird von
 * Anfang bis Ende erkannt und als Karte (Domain + Seitenname) abgelegt, Doppelte fallen weg. Einzeln entfernbar, mit Zähler.
 * Gesendet wird ein verstecktes Feld `name` mit einer Adresse pro Zeile.
 */
export function SourceUrlInput({ urls, onChange, locale, max, name = "sourceUrls" }: { urls: string[]; onChange: (urls: string[]) => void; locale: "de" | "en"; max: number; name?: string }) {
  const de = locale === "de";
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function absorb(text: string): boolean {
    const found = extractUrls(text);
    if (found.length === 0) return false;
    const fresh = found.filter((u) => !urls.includes(u));
    const room = Math.max(0, max - urls.length);
    onChange([...urls, ...fresh.slice(0, room)]);
    const notes: string[] = [];
    if (found.length > fresh.length) notes.push(fill(c_sourceUrlInput(de).n0AlreadyAdded, found.length - fresh.length));
    if (fresh.length > room) notes.push(fill(c_sourceUrlInput(de).n0NotAddedMax1, fresh.length - room, max));
    setNotice(notes.length ? notes.join(" · ") : null);
    return true;
  }

  return (
    <div data-testid="source-urls">
      <input type="hidden" name={name} value={urls.join("\n")} />
      <textarea
        value={draft}
        rows={2}
        data-testid="source-urls-draft"
        placeholder={c_sourceUrlInput(de).pasteAddressesHereOneOr}
        onChange={(e) => setDraft(e.target.value)}
        onPaste={(e) => {
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
            else setNotice(c_sourceUrlInput(de).noValidAddressFoundStart);
          }
        }}
        className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
      />
      {notice && <p className="mt-1 text-xs text-warning-text" role="status" data-testid="source-urls-notice">{notice}</p>}
      <p className="mt-1 text-xs text-subtle" data-testid="source-urls-count">
        {fill(c_sourceUrlInput(de).n0Of1Sources, urls.length, max)}
        {urls.length > 0 && (
          <button type="button" className="ml-2 underline" onClick={() => onChange([])}>{c_sourceUrlInput(de).clearAll}</button>
        )}
      </p>
      {urls.length > 0 && (
        <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto" data-testid="source-urls-list">
          {urls.map((url) => {
            const d = describeUrl(url);
            return (
              <li key={url} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1" title={url}>
                  <span className="block truncate font-medium">{d.host}</span>
                  {d.path && <span className="block truncate text-subtle">{d.path}</span>}
                </span>
                <button type="button" aria-label={c_sourceUrlInput(de).removeSource} onClick={() => onChange(urls.filter((u) => u !== url))} className="rounded p-1 hover:bg-background">
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
