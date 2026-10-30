"use client";

import { c_aiSettingsPanel } from "@/lib/i18n/components/aiSettingsPanel";
import { fill } from "@/lib/i18n/fill";
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
      setError(body?.error ?? (c_aiSettingsPanel(de).couldNotSave));
      return;
    }
    setApiKey("");
    setNotice(c_aiSettingsPanel(de).saved);
    router.refresh();
  }

  async function removeKey() {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/company/ai-settings/key", { method: "DELETE" });
    if (!res.ok) {
      setError(c_aiSettingsPanel(de).couldNotRemove);
      return;
    }
    setNotice(c_aiSettingsPanel(de).keyRemoved);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="ai-settings-panel">
      <h2 className="text-lg font-medium">{c_aiSettingsPanel(de).aiAccessForInternalLearning}</h2>
      <p className="mt-1 text-sm text-muted">
        {c_aiSettingsPanel(de).youCreateInternalLearningPaths}
      </p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="ai-mode" checked={mode === "platform"} onChange={() => setMode("platform")} className="mt-1" />
          <span>
            <span className="font-medium">{c_aiSettingsPanel(de).throughOurAccess}</span>
            <span className="block text-xs text-muted">{c_aiSettingsPanel(de).weProvideTheAiAccess}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="ai-mode" checked={mode === "byok"} onChange={() => setMode("byok")} className="mt-1" />
          <span>
            <span className="font-medium">{c_aiSettingsPanel(de).ownKeyByok}</span>
            <span className="block text-xs text-muted">
              {c_aiSettingsPanel(de).aiUsageRunsThroughYour}
            </span>
          </span>
        </label>
        {mode === "byok" && (
          <div className="ml-6 flex flex-col gap-2">
            {!settings.encryptionConfigured && (
              <p className="text-xs text-danger-text" data-testid="ai-no-encryption">
                {c_aiSettingsPanel(de).ownKeysCannotBeStored}
              </p>
            )}
            {settings.hasKey && (
              <p className="text-xs text-muted" data-testid="ai-key-status">
                {fill(c_aiSettingsPanel(de).storedKey0, settings.keyLast4)}
              </p>
            )}
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.hasKey ? (c_aiSettingsPanel(de).enterANewKeyTo) : c_aiSettingsPanel(de).geminiApiKey}
              aria-label={c_aiSettingsPanel(de).apiKey}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {settings.hasKey && (
              <div>
                <button type="button" onClick={() => void removeKey()} className="text-xs text-danger-text hover:underline">
                  {c_aiSettingsPanel(de).removeStoredKey}
                </button>
              </div>
            )}
          </div>
        )}
        <div>
          <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50">
            {pending ? (c_aiSettingsPanel(de).checking) : c_aiSettingsPanel(de).save}
          </button>
          <span className="ml-3 text-xs text-muted" data-testid="ai-mode-status">
            {c_aiSettingsPanel(de).current}
            {settings.mode === "platform" ? (c_aiSettingsPanel(de).ourAccess) : settings.mode === "byok" ? (c_aiSettingsPanel(de).ownKey) : c_aiSettingsPanel(de).notSetUp}
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
