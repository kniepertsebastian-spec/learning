"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MAX_ITEMS, MIN_ITEMS, PROBE_ERROR_LABEL, PROBE_ERROR_TYPES, type ProbeItemDraft } from "@/lib/reviewers/probe";
import type { ProbeErrorType } from "@/lib/server/db/schema";

export type SetRow = { id: string; title: string; topic: string; language: "de" | "en"; active: boolean; itemCount: number; plantedCount: number; attempts: number };
export type AttemptRow = { id: string; reviewerName: string; setTitle: string; submittedAt: string; result: { found: number; plantedTotal: number; falseAlarms: number; passed: boolean }; extraNotes: Array<{ question: string; type: ProbeErrorType; text: string }> };
export type QualificationRow = { userId: string; email: string; name: string | null; qualified: boolean; source: "probe" | "admin" | null };
type EditSet = { id: string; title: string; topic: string; language: "de" | "en"; active: boolean; attempts: number; items: ProbeItemDraft[] };

const field = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";
const blankItem = (): ProbeItemDraft => ({ question: "", options: [0, 1, 2, 3].map((i) => ({ text: "", isCorrect: i === 0 })), explanation: "", plantedError: null });

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: { error?: string; problems?: string[]; id?: string } & Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: res.status === 204 ? {} : ((await res.json().catch(() => ({}))) as never) };
  } catch {
    return { ok: false, data: { error: "Netzwerkfehler" } };
  }
}

/** Betreiber: Probe-Review-Sätze mit eingebauten Fehlern pflegen, Ergebnisse einsehen (nur intern), Prüfer freischalten. */
export function ProbeAdmin({ sets, attempts, qualifications, locale }: { sets: SetRow[]; attempts: AttemptRow[]; qualifications: QualificationRow[]; locale: "de" | "en" }) {
  const de = locale === "de";
  const router = useRouter();
  const [edit, setEdit] = useState<EditSet | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; problems?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState({ title: "", topic: "", language: "de" as "de" | "en" });

  async function open(id: string) {
    const r = await call(`/api/admin/reviewers/probe/sets/${id}`, "GET");
    if (r.ok) setEdit(r.data as unknown as EditSet);
    setMessage(null);
  }
  async function createSet() {
    setBusy(true);
    const r = await call("/api/admin/reviewers/probe/sets", "POST", create);
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "error", text: r.data.error ?? "Fehler" });
    setCreate({ title: "", topic: "", language: "de" });
    router.refresh();
    if (r.data.id) await open(r.data.id);
  }
  async function save() {
    if (!edit) return;
    setBusy(true);
    const r = await call(`/api/admin/reviewers/probe/sets/${edit.id}`, "PUT", { title: edit.title, topic: edit.topic, language: edit.language, active: edit.active, items: edit.items });
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "error", text: r.data.error ?? "Fehler", problems: r.data.problems });
    setMessage({ tone: "ok", text: de ? "Gespeichert." : "Saved." });
    router.refresh();
  }
  async function remove(id: string) {
    if (!window.confirm(de ? "Satz löschen?" : "Delete set?")) return;
    const r = await call(`/api/admin/reviewers/probe/sets/${id}`, "DELETE");
    if (!r.ok) return setMessage({ tone: "error", text: r.data.error ?? "Fehler" });
    if (edit?.id === id) setEdit(null);
    router.refresh();
  }
  async function qualify(userId: string, granted: boolean) {
    const r = await call("/api/admin/reviewers/qualifications", "POST", { userId, granted });
    if (!r.ok) return setMessage({ tone: "error", text: r.data.error ?? "Fehler" });
    router.refresh();
  }

  const locked = (edit?.attempts ?? 0) > 0;
  const setItem = (i: number, patch: Partial<ProbeItemDraft>) => edit && setEdit({ ...edit, items: edit.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  return (
    <div className="flex flex-col gap-8" data-testid="probe-admin">
      {message && (
        <div role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm text-danger-text" : "rounded-xl border border-mint-border bg-mint-soft p-3 text-sm text-mint-text"} data-testid="probe-admin-message">
          {message.text}
          {message.problems && message.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {message.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{de ? "Sätze" : "Sets"}</h2>
        <p className="text-xs text-subtle">
          {de
            ? `Ein Satz hat ${MIN_ITEMS} bis ${MAX_ITEMS} Fragen, davon 4 bis 5 mit eingebauten Fehlern (Fehlertyp und Notiz legst du fest). Bestanden ist, wer mindestens 80 % der eingebauten Fehler findet (4 von 5) und höchstens 2 Fehlalarme hat. Sätze mit Versuchen sind gesperrt.`
            : `A set has ${MIN_ITEMS} to ${MAX_ITEMS} questions, 4 to 5 of them with built-in errors (you define type and note). Passing means finding at least 80% of the built-in errors (4 of 5) with at most 2 false alarms. Sets with attempts are locked.`}
        </p>
        <ul className="flex flex-col gap-2">
          {sets.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm" data-testid="probe-admin-set">
              <span>
                <span className="font-medium">{s.title}</span> <span className="text-subtle">· {s.topic} · {s.language} · {s.itemCount} {de ? "Fragen" : "questions"}, {s.plantedCount} {de ? "Fehler" : "errors"} · {s.attempts} {de ? "Versuche" : "attempts"}</span>{" "}
                {s.active ? <Badge tone="mint">{de ? "aktiv" : "active"}</Badge> : <Badge tone="neutral">{de ? "inaktiv" : "inactive"}</Badge>}
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => void open(s.id)} data-testid="probe-admin-edit">{de ? "Bearbeiten" : "Edit"}</Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(s.id)}>{de ? "Löschen" : "Delete"}</Button>
              </span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 rounded-xl border border-dashed border-border-strong p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className={field} placeholder={de ? "Titel" : "Title"} value={create.title} onChange={(e) => setCreate({ ...create, title: e.target.value })} data-testid="probe-new-title" />
          <input className={field} placeholder={de ? "Themengebiet" : "Topic"} value={create.topic} onChange={(e) => setCreate({ ...create, topic: e.target.value })} data-testid="probe-new-topic" />
          <select className={field} value={create.language} onChange={(e) => setCreate({ ...create, language: e.target.value as "de" | "en" })}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
          <Button size="sm" disabled={busy || !create.title.trim() || !create.topic.trim()} onClick={() => void createSet()} data-testid="probe-new-create">{de ? "Satz anlegen" : "Create set"}</Button>
        </div>
      </section>

      {edit && (
        <Card data-testid="probe-editor">
          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className={field} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label={de ? "Titel" : "Title"} />
            <input className={field} value={edit.topic} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} aria-label={de ? "Themengebiet" : "Topic"} />
            <select className={field} value={edit.language} disabled={locked} onChange={(e) => setEdit({ ...edit, language: e.target.value as "de" | "en" })}>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} data-testid="probe-active" />
            {de ? "Aktiv (für Kandidaten verfügbar; nur mit gültigem Satz)" : "Active (available to candidates; only with a valid set)"}
          </label>
          {locked && <p className="mb-3 text-sm text-warning-text">{de ? "Zu diesem Satz gibt es Versuche; die Fragen sind gesperrt." : "This set has attempts; the questions are locked."}</p>}
          <p className="mb-2 text-xs text-subtle" data-testid="probe-counts">
            {edit.items.length} {de ? "Fragen" : "questions"}, {edit.items.filter((i) => i.plantedError).length} {de ? "eingebaute Fehler" : "built-in errors"}
          </p>
          <ol className="flex flex-col gap-4">
            {edit.items.map((item, i) => (
              <li key={i} className="rounded-xl border border-border p-3 text-sm" data-testid="probe-editor-item">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{de ? "Frage" : "Question"} {i + 1}</span>
                  {!locked && <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, k) => k !== i) })}>{de ? "Entfernen" : "Remove"}</Button>}
                </div>
                <textarea className={field} rows={2} disabled={locked} placeholder={de ? "Fragetext" : "Question"} value={item.question} onChange={(e) => setItem(i, { question: e.target.value })} data-testid="probe-q-text" />
                <div className="mt-2 flex flex-col gap-1.5">
                  {item.options.map((o, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <input type="radio" disabled={locked} name={`key-${i}`} checked={o.isCorrect} onChange={() => setItem(i, { options: item.options.map((x, n) => ({ ...x, isCorrect: n === k })) })} aria-label={de ? `Option ${k + 1} ist als richtig markiert` : `Option ${k + 1} is marked correct`} />
                      <input className={field} disabled={locked} value={o.text} placeholder={`${de ? "Option" : "Option"} ${k + 1}`} onChange={(e) => setItem(i, { options: item.options.map((x, n) => (n === k ? { ...x, text: e.target.value } : x)) })} data-testid="probe-q-option" />
                    </div>
                  ))}
                </div>
                <textarea className={`${field} mt-2`} rows={2} disabled={locked} placeholder={de ? "Erklärung" : "Explanation"} value={item.explanation} onChange={(e) => setItem(i, { explanation: e.target.value })} data-testid="probe-q-explanation" />
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" disabled={locked} checked={Boolean(item.plantedError)} onChange={(e) => setItem(i, { plantedError: e.target.checked ? { type: "wrong_key", note: "" } : null })} data-testid="probe-q-planted" />
                  {de ? "Hier ist ein Fehler eingebaut" : "A built-in error is here"}
                </label>
                {item.plantedError && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr]">
                    <select className={field} disabled={locked} value={item.plantedError.type} onChange={(e) => setItem(i, { plantedError: { ...item.plantedError!, type: e.target.value as ProbeErrorType } })} data-testid="probe-q-error-type">
                      {PROBE_ERROR_TYPES.map((t) => (
                        <option key={t} value={t}>{PROBE_ERROR_LABEL[t][de ? "de" : "en"]}</option>
                      ))}
                    </select>
                    <input className={field} disabled={locked} placeholder={de ? "Notiz (nur für Admins): was ist falsch?" : "Note (admins only): what is wrong?"} value={item.plantedError.note} onChange={(e) => setItem(i, { plantedError: { ...item.plantedError!, note: e.target.value } })} data-testid="probe-q-error-note" />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            {!locked && <Button size="sm" variant="secondary" disabled={edit.items.length >= MAX_ITEMS} onClick={() => setEdit({ ...edit, items: [...edit.items, blankItem()] })} data-testid="probe-add-item">{de ? "Frage hinzufügen" : "Add question"}</Button>}
            <Button size="sm" disabled={busy} onClick={() => void save()} data-testid="probe-save">{de ? "Speichern" : "Save"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>{de ? "Schließen" : "Close"}</Button>
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-3" data-testid="probe-results">
        <h2 className="text-lg font-semibold">{de ? "Ergebnisse (nur intern)" : "Results (internal only)"}</h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-subtle">{de ? "Noch keine abgegebenen Versuche." : "No submitted attempts yet."}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attempts.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-surface p-3 text-sm" data-testid="probe-result-row">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.reviewerName}</span> <span className="text-subtle">· {a.setTitle} · {new Date(a.submittedAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}</span>
                  {a.result.passed ? <Badge tone="mint">{de ? "bestanden" : "passed"}</Badge> : <Badge tone="danger">{de ? "nicht bestanden" : "not passed"}</Badge>}
                </p>
                <p className="text-xs text-subtle">{a.result.found} {de ? "von" : "of"} {a.result.plantedTotal} {de ? "Fehlern gefunden" : "errors found"} · {a.result.falseAlarms} {de ? "Fehlalarme" : "false alarms"}</p>
                {a.extraNotes.length > 0 && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer">{de ? "Weitere Hinweise zu Fragen ohne eingebauten Fehler" : "Further notes on questions without a built-in error"} ({a.extraNotes.length})</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {a.extraNotes.map((n, i) => (
                        <li key={i}>
                          „{n.question}“ — {PROBE_ERROR_LABEL[n.type][de ? "de" : "en"]}: {n.text}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" data-testid="probe-qualifications">
        <h2 className="text-lg font-semibold">{de ? "Freigaberechte" : "Approval rights"}</h2>
        <p className="text-xs text-subtle">{de ? "Wer das Probe-Review bestanden hat oder hier freigeschaltet wird, darf Kurse freigeben und sein Profil veröffentlichen. Den ersten Experten wählst du persönlich aus und schaltest ihn hier frei." : "Anyone who passed the trial review or is cleared here may approve courses and publish their profile. You pick the first expert personally and clear them here."}</p>
        <ul className="flex flex-col gap-2">
          {qualifications.map((q) => (
            <li key={q.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm" data-testid="probe-qualification-row">
              <span>
                <span className="font-medium">{q.name ?? q.email}</span> {q.name ? <span className="text-subtle">· {q.email}</span> : null}{" "}
                {q.qualified ? <Badge tone="mint">{q.source === "probe" ? (de ? "Probe bestanden" : "passed trial") : de ? "vom Betreiber freigeschaltet" : "cleared by operator"}</Badge> : <Badge tone="warning">{de ? "nicht freigeschaltet" : "not cleared"}</Badge>}
              </span>
              <Button size="sm" variant={q.qualified ? "ghost" : "secondary"} onClick={() => void qualify(q.userId, !q.qualified)} data-testid="probe-qualify-toggle">
                {q.qualified ? (de ? "Freischaltung zurücknehmen" : "Revoke clearance") : de ? "Freischalten" : "Clear"}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
