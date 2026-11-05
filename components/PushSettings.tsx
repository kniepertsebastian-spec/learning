"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { currentSubscription, disablePush, enablePush, isIosWithoutInstall, isPushSupported } from "@/lib/client/push";
import { useLocale } from "@/lib/i18n";
import { c_pushMessages } from "@/lib/i18n/components/pushMessages";

interface PushInfo {
  configured: boolean;
  publicKey: string | null;
  prefs: { examReminders: boolean; reviewsDue: boolean; streakRisk: boolean };
}

type Pref = keyof PushInfo["prefs"];

/**
 * Einstellungen für Web Push (docs/roadmaps/roadmap_pwa.md, Phase 6): Gerät ein- und ausschalten, die drei Erinnerungsarten einzeln, Testnachricht.
 * Die Berechtigung des Browsers wird erst auf den Klick auf „Auf diesem Gerät benachrichtigen“ gefragt, nie beim Öffnen der Seite.
 */
export function PushSettings() {
  const { locale } = useLocale();
  const tx = c_pushMessages(locale);
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [supported, setSupported] = useState(true);
  const [ios, setIos] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let loaded: PushInfo | null = null;
      try {
        const response = await fetch("/api/push/preferences", { credentials: "same-origin" });
        if (response.ok) loaded = (await response.json()) as PushInfo;
      } catch {
        // Ohne Netz bleibt die Karte im Wartezustand
      }
      const existing = await currentSubscription().catch(() => null);
      if (cancelled) return;
      setSupported(isPushSupported());
      setIos(isIosWithoutInstall());
      if (loaded) setInfo(loaded);
      setSubscribed(existing !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleDevice() {
    if (!info?.publicKey || busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    if (subscribed) {
      await disablePush();
      setSubscribed(false);
    } else {
      const result = await enablePush(info.publicKey);
      if (result === "ok") setSubscribed(true);
      else setError(result === "denied" ? tx.denied : result === "unsupported" ? tx.unsupported : tx.failed);
    }
    setBusy(false);
  }

  async function changePref(key: Pref, value: boolean) {
    if (!info) return;
    setError(null);
    const previous = info.prefs;
    setInfo({ ...info, prefs: { ...info.prefs, [key]: value } });
    const response = await fetch("/api/push/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) }).catch(() => null);
    if (!response?.ok) {
      setInfo({ ...info, prefs: previous });
      setError(tx.failed);
    }
  }

  async function sendTest() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    const response = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const body = response?.ok ? ((await response.json()) as { delivered: number }) : null;
    if (body && body.delivered > 0) setMessage(tx.testSent);
    else setError(tx.failed);
    setBusy(false);
  }

  const rows: Array<{ key: Pref; label: string; hint?: string }> = [
    { key: "examReminders", label: tx.prefExam },
    { key: "reviewsDue", label: tx.prefReviews },
    { key: "streakRisk", label: tx.prefStreak, hint: tx.prefStreakHint },
  ];

  return (
    <Card data-testid="push-settings">
      <h2 className="text-base font-semibold">{tx.settingsTitle}</h2>
      <p className="mt-1 text-sm text-subtle">{tx.settingsIntro}</p>
      {info && !info.configured ? (
        <p className="mt-3 text-sm text-muted" data-testid="push-unavailable">{tx.unavailable}</p>
      ) : !supported ? (
        <p className="mt-3 text-sm text-muted" data-testid="push-unsupported">{ios ? tx.iosHint : tx.unsupported}</p>
      ) : (
        <>
          {ios && <p className="mt-3 text-sm text-muted" data-testid="push-ios-hint">{tx.iosHint}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant={subscribed ? "secondary" : "primary"} onClick={() => void toggleDevice()} disabled={!info || busy} data-testid="push-toggle">
              {subscribed ? tx.disable : tx.enable}
            </Button>
            <span className="text-sm text-subtle" data-testid="push-state">{subscribed ? tx.on : tx.off}</span>
            {subscribed && (
              <Button type="button" variant="ghost" onClick={() => void sendTest()} disabled={busy} data-testid="push-test">
                {tx.sendTest}
              </Button>
            )}
          </div>
          {info && (
            <fieldset className="mt-4 flex flex-col gap-2">
              <legend className="sr-only">{tx.settingsTitle}</legend>
              {rows.map((row) => (
                <label key={row.key} className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={info.prefs[row.key]} onChange={(e) => void changePref(row.key, e.target.checked)} data-testid={`push-pref-${row.key}`} />
                  <span>
                    <span className="block font-medium">{row.label}</span>
                    {row.hint && <span className="text-subtle">{row.hint}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}
      <div aria-live="polite">
        {message && <p className="mt-3 text-sm text-mint-text">{message}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}
      </div>
    </Card>
  );
}
