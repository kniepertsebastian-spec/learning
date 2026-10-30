"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AiSettingsState = {
  mode: "platform" | "byok" | null;
  hasKey: boolean;
  keyLast4: string | null;
  encryptionConfigured: boolean;
};

/** Firmen-Admin: KI-Zugang für interne Lernpfade (unser Zugang oder eigener Schlüssel). Der Schlüssel wird nie angezeigt. */
export function AiSettingsPanel({ settings, locale }: { settings: AiSettingsState; locale: "de" | "en" }) {
  const router = useRouter();
  const de = locale === "de";
  const [mode, setMode] = useState<"platform" | "byok">(settings.mode ?? "platform");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/company/ai-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, apiKey: apiKey.trim() || null }),
    });
    const body = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(body?.error ?? (de ? "Speichern fehlgeschlagen." : "Could not save."));
      return;
    }
    setApiKey("");
    setNotice(de ? "Gespeichert." : "Saved.");
    router.refresh();
  }

  async function removeKey() {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/company/ai-settings/key", { method: "DELETE" });
    if (!res.ok) {
      setError(de ? "Entfernen fehlgeschlagen." : "Could not remove.");
      return;
    }
    setNotice(de ? "Schlüssel entfernt." : "Key removed.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="ai-settings-panel">
      <h2 className="text-lg font-medium">{de ? "KI-Zugang für interne Lernpfade" : "AI access for internal learning paths"}</h2>
      <p className="mt-1 text-sm text-muted">
        {de
          ? "Interne Lernpfade erzeugst du aus deinen Dokumenten mit KI. Wähle, über welchen Zugang das läuft. Deine Dokumente gehen dabei an den jeweiligen KI-Anbieter (Google Gemini)."
          : "You create internal learning paths from your documents with AI. Choose which access is used. Your documents are sent to the respective AI provider (Google Gemini)."}
      </p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="ai-mode" checked={mode === "platform"} onChange={() => setMode("platform")} className="mt-1" />
          <span>
            <span className="font-medium">{de ? "Über unseren Zugang" : "Through our access"}</span>
            <span className="block text-xs text-muted">{de ? "Wir stellen den KI-Zugang bereit." : "We provide the AI access."}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="ai-mode" checked={mode === "byok"} onChange={() => setMode("byok")} className="mt-1" />
          <span>
            <span className="font-medium">{de ? "Eigener Schlüssel (BYOK)" : "Own key (BYOK)"}</span>
            <span className="block text-xs text-muted">
              {de ? "Die KI-Nutzung läuft über dein eigenes Google-Gemini-Konto und wird dort abgerechnet." : "AI usage runs through your own Google Gemini account and is billed there."}
            </span>
          </span>
        </label>
        {mode === "byok" && (
          <div className="ml-6 flex flex-col gap-2">
            {!settings.encryptionConfigured && (
              <p className="text-xs text-danger-text" data-testid="ai-no-encryption">
                {de ? "Eigene Schlüssel lassen sich auf diesem Server noch nicht speichern. Bitte den Betreiber informieren." : "Own keys cannot be stored on this server yet. Please contact the operator."}
              </p>
            )}
            {settings.hasKey && (
              <p className="text-xs text-muted" data-testid="ai-key-status">
                {de ? `Gespeicherter Schlüssel: …${settings.keyLast4}` : `Stored key: …${settings.keyLast4}`}
              </p>
            )}
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.hasKey ? (de ? "Neuen Schlüssel eingeben, um ihn zu ersetzen" : "Enter a new key to replace it") : de ? "Gemini-API-Schlüssel" : "Gemini API key"}
              aria-label={de ? "API-Schlüssel" : "API key"}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {settings.hasKey && (
              <div>
                <button type="button" onClick={() => void removeKey()} className="text-xs text-danger-text hover:underline">
                  {de ? "Gespeicherten Schlüssel entfernen" : "Remove stored key"}
                </button>
              </div>
            )}
          </div>
        )}
        <div>
          <button type="submit" disabled={pending} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50">
            {pending ? (de ? "Wird geprüft …" : "Checking …") : de ? "Speichern" : "Save"}
          </button>
          <span className="ml-3 text-xs text-muted" data-testid="ai-mode-status">
            {de ? "Aktuell: " : "Current: "}
            {settings.mode === "platform" ? (de ? "unser Zugang" : "our access") : settings.mode === "byok" ? (de ? "eigener Schlüssel" : "own key") : de ? "nicht eingerichtet" : "not set up"}
          </span>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm" data-testid="ai-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
