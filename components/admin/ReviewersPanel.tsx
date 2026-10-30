"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Course = { id: string; name: string };
type Reviewer = { id: string; email: string; name: string | null; courses: Course[] };
type Invitation = { id: string; email: string; courses: number; expiresAt: string };
type Comment = { id: string; courseName: string; targetType: "section" | "question"; kind: "comment" | "faulty"; text: string; reviewerName: string | null; createdAt: string };

async function call(url: string, method: string, body?: unknown): Promise<{ error: string | null; data: unknown }> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return { error: null, data: res.status === 204 ? null : await res.json().catch(() => null) };
  return { error: ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Fehler ${res.status}`, data: null };
}

/** Betreiber: Prüfer einladen (E-Mail + Kurse), Kursen zuweisen oder Zuweisung aufheben, offene Prüfer-Kommentare erledigen. */
export function ReviewersPanel({ locale, courses, reviewers, invitations, comments }: { locale: "de" | "en"; courses: Course[]; reviewers: Reviewer[]; invitations: Invitation[]; comments: Comment[] }) {
  const router = useRouter();
  const de = locale === "de";
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});

  async function act(url: string, method: string, body?: unknown) {
    setError(null);
    const r = await call(url, method, body);
    if (r.error) setError(r.error);
    router.refresh();
    return r;
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setLink(null);
    setMessage(null);
    const r = await act("/api/admin/reviewers/invitations", "POST", { email, certificationIds: [selected] });
    if (r.error) return;
    const data = r.data as { mailed: boolean; link: string | null } | null;
    if (data?.mailed) setMessage(de ? "Einladung per E-Mail verschickt." : "Invitation sent by email.");
    else if (data?.link) setLink(`${window.location.origin}${data.link}`);
    setEmail("");
    setSelected("");
  }

  return (
    <div className="flex flex-col gap-6" data-testid="reviewers-panel">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-medium">{de ? "Prüfer einladen" : "Invite a reviewer"}</h2>
        <form onSubmit={invite} className="mt-3 flex flex-col gap-3 text-sm">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={de ? "E-Mail-Adresse" : "Email address"} aria-label={de ? "E-Mail-Adresse" : "Email address"} data-testid="reviewer-invite-email" className="h-11 max-w-xl rounded-md border border-border-strong bg-control px-3" />
          <label className="flex flex-col gap-1">
            <span className="text-subtle">{de ? "Der eine Kurs, den er nach Annahme betreut (nur allgemeine Kurse)" : "The one course they will review after acceptance (general courses only)"}</span>
            <select required value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="reviewer-invite-course" className="h-11 max-w-xl rounded-md border border-border-strong bg-control px-3">
              <option value="">{de ? "Kurs wählen …" : "Choose a course …"}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <Button type="submit" className="w-fit" disabled={!email || !selected} data-testid="reviewer-invite-send">{de ? "Einladen" : "Invite"}</Button>
        </form>
        {message && <p role="status" className="mt-2 text-sm">{message}</p>}
        {link && (
          <p className="mt-2 break-all text-sm" data-testid="reviewer-invite-link">
            {de ? "E-Mail-Versand ist nicht eingerichtet. Link zum Weitergeben:" : "Email is not set up. Link to pass on:"} <code>{link}</code>
          </p>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-danger-text">{error}</p>}
      </section>

      {invitations.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-medium">{de ? "Offene Einladungen" : "Open invitations"}</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <span>{i.email} · {de ? "gültig bis" : "valid until"} {new Date(i.expiresAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}</span>
                <button type="button" className="text-link hover:underline" onClick={() => void act(`/api/admin/reviewers/invitations/${i.id}`, "DELETE")}>{de ? "Widerrufen" : "Revoke"}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-medium">{de ? "Prüfer und ihre Kurse" : "Reviewers and their courses"}</h2>
        {reviewers.length === 0 && <p className="mt-2 text-sm text-subtle">{de ? "Noch keine Prüfer." : "No reviewers yet."}</p>}
        <ul className="mt-2 flex flex-col gap-3 text-sm">
          {reviewers.map((r) => (
            <li key={r.id} data-testid="reviewer-row">
              <p className="font-medium">{r.name ?? r.email} <span className="text-subtle">{r.name ? r.email : ""}</span></p>
              <ul className="ml-4 list-disc">
                {r.courses.map((c) => (
                  <li key={c.id}>
                    {c.name}{" "}
                    <button type="button" className="text-link hover:underline" onClick={() => void act("/api/admin/reviewers/assignments", "DELETE", { certificationId: c.id, userId: r.id })}>{de ? "Zuweisung aufheben" : "Unassign"}</button>
                  </li>
                ))}
                {r.courses.length === 0 && <li className="text-subtle">{de ? "Noch kein Kurs zugewiesen (ein Prüfer betreut genau einen Kurs)" : "No course assigned yet (a reviewer looks after exactly one course)"}</li>}
              </ul>
              {r.courses.length === 0 && (
              <div className="mt-1 flex gap-2">
                <select value={assign[r.id] ?? ""} onChange={(e) => setAssign((a) => ({ ...a, [r.id]: e.target.value }))} aria-label={de ? "Kurs zuweisen" : "Assign course"} className="rounded-md border border-border bg-background px-2 py-1">
                  <option value="">{de ? "Kurs wählen …" : "Choose course …"}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button size="sm" variant="secondary" disabled={!assign[r.id]} onClick={() => void act("/api/admin/reviewers/assignments", "POST", { certificationId: assign[r.id], userId: r.id })}>{de ? "Zuweisen" : "Assign"}</Button>
              </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5" data-testid="reviewer-comments">
        <h2 className="font-medium">{de ? "Offene Kommentare der Prüfer" : "Open reviewer comments"}</h2>
        {comments.length === 0 && <p className="mt-2 text-sm text-subtle">{de ? "Keine offenen Kommentare." : "No open comments."}</p>}
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-background p-3">
              <p className="text-xs text-subtle">{c.courseName} · {c.targetType === "question" ? (de ? "Frage" : "Question") : de ? "Lektion" : "Lesson"} · {c.kind === "faulty" ? (de ? "als fehlerhaft gemeldet" : "reported faulty") : de ? "Kommentar" : "comment"} · {c.reviewerName ?? "?"}</p>
              <p>{c.text}</p>
              <button type="button" className="mt-1 text-xs text-link hover:underline" onClick={() => void act(`/api/admin/reviewers/comments/${c.id}`, "POST")}>{de ? "Erledigt" : "Resolve"}</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
