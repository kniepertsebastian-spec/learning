"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PROBE_ERROR_LABEL, PROBE_ERROR_TYPES } from "@/lib/reviewers/probe";
import type { ProbeErrorType, ProbeReport } from "@/lib/server/db/schema";
import type { Locale } from "@/lib/types";

export type ProbeOverviewJson = {
  qualified: boolean;
  source: "probe" | "admin" | null;
  openAttemptId: string | null;
  available: Array<{ id: string; title: string; topic: string; itemCount: number }>;
  blockedUntil: string | null;
  lastOutcome: "passed" | "failed" | null;
};
export type ProbeAttemptJson = {
  id: string;
  title: string;
  topic: string;
  items: Array<{ id: string; question: string; options: Array<{ text: string; isCorrect: boolean }>; explanation: string }>;
  reports: ProbeReport[];
};

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, data: { error: "Netzwerkfehler" } };
  }
}

/** Probe-Review für neue Prüfer: Fragen prüfen und fehlerhafte melden. Ergebnis nur „bestanden/nicht bestanden“, Einzelheiten sind intern. */
export function ReviewerProbe({ overview, attempt, locale }: { overview: ProbeOverviewJson; attempt: ProbeAttemptJson | null; locale: Locale }) {
  const [confirm, confirmDialog] = useConfirm();
  const de = locale === "de";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ passed: boolean; nextAttemptAt: string | null } | null>(null);
  const date = (iso: string) => new Date(iso).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });

  async function start(setId: string) {
    setBusy(true);
    setError(null);
    const r = await send("/api/reviewer/probe/attempts", "POST", { setId });
    setBusy(false);
    if (!r.ok) return setError(String(r.data.error ?? "Das hat nicht geklappt."));
    router.refresh();
  }

  async function submit() {
    if (!attempt || !(await confirm(de ? "Versuch abgeben? Danach lässt sich nichts mehr ändern." : "Submit the attempt? You cannot change anything afterwards."))) return;
    setBusy(true);
    setError(null);
    const r = await send(`/api/reviewer/probe/attempts/${attempt.id}/submit`, "POST");
    setBusy(false);
    if (!r.ok) return setError(String(r.data.error ?? "Das hat nicht geklappt."));
    setResult({ passed: Boolean(r.data.passed), nextAttemptAt: (r.data.nextAttemptAt as string | null) ?? null });
    router.refresh();
  }

  if (result) {
    return (
      <Card data-testid="probe-result" data-passed={result.passed}>
        <h2 className="mb-1 text-lg font-semibold">{result.passed ? (de ? "Bestanden" : "Passed") : de ? "Leider nicht bestanden" : "Not passed"}</h2>
        <p className="text-sm text-subtle">
          {result.passed
            ? de ? "Du kannst jetzt Kurse freigeben und dein Expertenprofil veröffentlichen." : "You can now approve courses and publish your expert profile."
            : de ? `Einen weiteren Versuch mit einem anderen Satz kannst du ab ${date(result.nextAttemptAt ?? new Date().toISOString())} machen.` : `You can try again with a different set from ${date(result.nextAttemptAt ?? new Date().toISOString())}.`}
        </p>
      </Card>
    );
  }

  if (overview.qualified) {
    return (
      <Card data-testid="probe-qualified">
        <p className="text-sm">
          <Badge tone="mint">{de ? "Freigeschaltet" : "Cleared"}</Badge>{" "}
          {overview.source === "probe" ? (de ? "Du hast das Probe-Review bestanden." : "You passed the trial review.") : de ? "Der Betreiber hat dich freigeschaltet." : "The operator has cleared you."}{" "}
          {de ? "Du kannst Kurse freigeben und dein Profil veröffentlichen." : "You can approve courses and publish your profile."}
        </p>
      </Card>
    );
  }

  if (attempt) {
    const reportOf = (id: string) => attempt.reports.find((r) => r.itemId === id) ?? null;
    return (
      <div className="flex flex-col gap-4" data-testid="probe-attempt">
        <div>
          <h2 className="text-lg font-semibold">{attempt.title}</h2>
          <p className="text-sm text-subtle">
            {de
              ? "Prüfe jede Frage fachlich: Stimmt der markierte Lösungsschlüssel, ist die Frage eindeutig und aktuell, passt die Erklärung? Melde nur Fragen mit einem echten Fehler und begründe kurz. Mehrere Fehlalarme verschlechtern das Ergebnis."
              : "Check every question technically: is the marked key right, is the question unambiguous and current, does the explanation fit? Only report questions with a real error and give a short reason. Several false alarms hurt the result."}
          </p>
          <p className="mt-1 text-xs text-subtle" data-testid="probe-count">{attempt.reports.length} {de ? "von" : "of"} {attempt.items.length} {de ? "Fragen gemeldet" : "questions reported"}</p>
        </div>
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        <ol className="flex flex-col gap-3">
          {attempt.items.map((item, i) => (
            <ProbeItem key={item.id} index={i + 1} item={item} report={reportOf(item.id)} attemptId={attempt.id} de={de} onChanged={() => router.refresh()} />
          ))}
        </ol>
        <div>
          <Button onClick={() => void submit()} disabled={busy} data-testid="probe-submit">{de ? "Versuch abgeben" : "Submit attempt"}</Button>
        </div>
      </div>
    );
  }

  return (
    <>
    {confirmDialog}
    <div className="flex flex-col gap-4" data-testid="probe-start">
      <p className="text-sm text-subtle">
        {de
          ? "Bevor du Kurse freigeben und dein Profil veröffentlichen kannst, zeigst du in einem kurzen Probe-Review, dass du fachlich gut prüfst: Ein Satz Fragen enthält eingebaute Fehler, die du finden sollst. Das Ergebnis sehen nur die Betreiber; dir zeigen wir „bestanden“ oder „nicht bestanden“. Ein neuer Versuch ist frühestens nach 30 Tagen mit einem anderen Satz möglich."
          : "Before you can approve courses and publish your profile, a short trial review shows that you check well: a set of questions contains built-in errors you should find. Only the operators see the details; you get “passed” or “not passed”. A new attempt is possible after 30 days at the earliest, with a different set."}
      </p>
      {overview.lastOutcome === "failed" && <p className="text-sm text-warning-text" data-testid="probe-failed-note">{de ? "Dein letzter Versuch war nicht erfolgreich." : "Your last attempt was not successful."}</p>}
      {overview.blockedUntil && <p className="text-sm" data-testid="probe-blocked">{de ? `Der nächste Versuch ist ab ${date(overview.blockedUntil)} möglich.` : `The next attempt is possible from ${date(overview.blockedUntil)}.`}</p>}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {overview.available.length === 0 && !overview.blockedUntil && <p className="text-sm text-subtle" data-testid="probe-none">{de ? "Zurzeit ist kein Satz für dich verfügbar. Die Betreiber melden sich." : "No set is available for you right now. The operators will get in touch."}</p>}
      <ul className="flex flex-col gap-2">
        {overview.available.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm" data-testid="probe-set">
            <span>
              <span className="font-medium">{s.title}</span> <span className="text-subtle">· {s.topic} · {s.itemCount} {de ? "Fragen" : "questions"}</span>
            </span>
            <Button size="sm" onClick={() => void start(s.id)} disabled={busy} data-testid="probe-begin">{de ? "Beginnen" : "Begin"}</Button>
          </li>
        ))}
      </ul>
    </div>
    </>
  );
}

function ProbeItem({ index, item, report, attemptId, de, onChanged }: { index: number; item: ProbeAttemptJson["items"][number]; report: ProbeReport | null; attemptId: string; de: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ProbeErrorType>(report?.type ?? "wrong_key");
  const [text, setText] = useState(report?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (t: ProbeErrorType) => PROBE_ERROR_LABEL[t][de ? "de" : "en"];

  async function save(next: { type: ProbeErrorType; text: string } | null) {
    setBusy(true);
    setError(null);
    const r = await send(`/api/reviewer/probe/attempts/${attemptId}/reports`, "PUT", { itemId: item.id, report: next });
    setBusy(false);
    if (!r.ok) return setError(String(r.data.error ?? "Das hat nicht geklappt."));
    if (!next) setText("");
    setOpen(false);
    onChanged();
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4 text-sm" data-testid="probe-item" data-reported={Boolean(report)}>
      <p className="font-medium">{index}. {item.question}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {item.options.map((o, k) => (
          <li key={k} className={o.isCorrect ? "font-medium text-mint-text" : ""}>
            {o.isCorrect ? (de ? "✓ (Lösungsschlüssel) " : "✓ (answer key) ") : "· "}
            {o.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-subtle">{de ? "Erklärung" : "Explanation"}: {item.explanation}</p>
      {report && !open && (
        <p className="mt-2 text-xs" data-testid="probe-reported">
          <Badge tone="warning">{de ? "Gemeldet" : "Reported"}</Badge> {label(report.type)}: {report.text}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!open && <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="probe-report-open">{report ? (de ? "Meldung ändern" : "Edit report") : de ? "Als fehlerhaft melden" : "Report as faulty"}</Button>}
        {report && !open && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null)} data-testid="probe-report-remove">{de ? "Meldung zurücknehmen" : "Withdraw report"}</Button>}
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-accent-border p-3" data-testid="probe-report-form">
          <label className="text-xs font-medium">
            {de ? "Art des Fehlers" : "Kind of error"}
            <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value as ProbeErrorType)} data-testid="probe-report-type">
              {PROBE_ERROR_TYPES.map((t) => (
                <option key={t} value={t}>{label(t)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            {de ? "Begründung" : "Reason"}
            <textarea className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} data-testid="probe-report-text" />
          </label>
          {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || text.trim().length < 3} onClick={() => void save({ type, text })} data-testid="probe-report-save">{de ? "Meldung speichern" : "Save report"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{de ? "Abbrechen" : "Cancel"}</Button>
          </div>
        </div>
      )}
    </li>
  );
}
