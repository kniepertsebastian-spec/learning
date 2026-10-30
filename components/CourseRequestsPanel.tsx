"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { REQUEST_STATUS_LABELS } from "@/lib/course-requests";
import type { CourseRequestStatus } from "@/lib/server/db/schema";

export type RequestView = {
  id: string;
  status: CourseRequestStatus;
  statusNote: string | null;
  wishTitle: string | null;
  wishDescription: string | null;
  courseName: string | null;
  createdAt: string;
  events: { status: CourseRequestStatus; note: string | null; createdAt: string }[];
};

const OPEN: CourseRequestStatus[] = ["submitted", "on_hold", "in_creation", "in_review"];

const date = (iso: string, locale: "de" | "en") => new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" });

/** Firmenbereich: allgemeine Lernpfade anfragen (aus dem Katalog oder als freier Wunsch) und den Stand verfolgen. */
export function CourseRequestsPanel({
  requests,
  catalog,
  locale,
}: {
  requests: RequestView[];
  catalog: { id: string; name: string }[];
  locale: "de" | "en";
}) {
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const de = locale === "de";
  const [mode, setMode] = useState<"catalog" | "wish">(catalog.length > 0 ? "catalog" : "wish");
  const [certId, setCertId] = useState(catalog[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const body = mode === "catalog" ? { certificationId: certId } : { wishTitle: title, wishDescription: description || null };
    const res = await fetch("/api/company/course-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? (de ? "Anfrage fehlgeschlagen." : "Request failed."));
      return;
    }
    setNotice(de ? "Anfrage ist eingegangen. Den Stand siehst du hier." : "Request received. You can follow its status here.");
    setTitle("");
    setDescription("");
    router.refresh();
  }

  async function withdraw(id: string) {
    if (!(await confirm(de ? "Anfrage wirklich zurückziehen?" : "Really withdraw this request?"))) return;
    setError(null);
    const res = await fetch(`/api/company/course-requests/${id}/withdraw`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? (de ? "Zurückziehen fehlgeschlagen." : "Could not withdraw."));
    }
    router.refresh();
  }

  return (
    <>
    {confirmDialog}
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="requests-panel">
      <h2 className="text-lg font-medium">{de ? "Allgemeine Lernpfade anfragen" : "Request general learning paths"}</h2>
      <p className="mt-1 text-sm text-muted">
        {de
          ? "Allgemeine Lernpfade (z. B. Security oder Zertifikate) erstellen wir und geben sie für deine Firma frei. Gibt es den Kurs schon, geben wir ihn frei. Sonst erstellen wir ihn, lassen ihn fachlich prüfen und melden uns. Bis dahin steht hier der aktuelle Stand."
          : "We create general learning paths (e.g. security or certifications) and release them for your company. If the course exists we release it. Otherwise we create it, have it reviewed by an expert and get back to you. The current status is shown here."}
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === "catalog"} onChange={() => setMode("catalog")} disabled={catalog.length === 0} />
            {de ? "Aus dem Katalog" : "From the catalog"}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === "wish"} onChange={() => setMode("wish")} />
            {de ? "Freier Wunsch" : "Free wish"}
          </label>
        </div>
        {mode === "catalog" ? (
          <select value={certId} onChange={(e) => setCertId(e.target.value)} aria-label={de ? "Lernpfad" : "Learning path"} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder={de ? "Was soll der Kurs behandeln?" : "What should the course cover?"}
              aria-label={de ? "Wunsch" : "Wish"}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={de ? "Zielgruppe, Umfang, Besonderheiten (optional)" : "Audience, scope, specifics (optional)"}
              aria-label={de ? "Beschreibung" : "Description"}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </>
        )}
        <div>
          <button
            type="submit"
            disabled={pending || (mode === "catalog" ? !certId : title.trim().length < 3)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
          >
            {de ? "Anfragen" : "Request"}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm" data-testid="request-notice">
          {notice}
        </p>
      )}

      <h3 className="mt-6 text-base font-medium">{de ? "Deine Anfragen" : "Your requests"}</h3>
      {requests.length === 0 ? (
        <p className="mt-2 text-sm text-muted" data-testid="requests-empty">
          {de ? "Noch keine Anfragen." : "No requests yet."}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3" data-testid="requests-list">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-background p-3 text-sm" data-testid="request-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{r.courseName ?? r.wishTitle}</span>
                <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-medium text-link" data-testid="request-status">
                  {REQUEST_STATUS_LABELS[r.status][locale]}
                </span>
              </div>
              {OPEN.includes(r.status) && (
                <button type="button" onClick={() => void withdraw(r.id)} data-testid="request-withdraw" className="mt-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface">
                  {de ? "Anfrage zurückziehen" : "Withdraw request"}
                </button>
              )}
              {r.wishDescription && <p className="mt-1 text-xs text-muted">{r.wishDescription}</p>}
              {r.statusNote && (
                <p className="mt-1 text-xs" data-testid="request-note">
                  {r.statusNote}
                </p>
              )}
              <ol className="mt-2 border-l border-border pl-3 text-xs text-muted">
                {r.events.map((ev, i) => (
                  <li key={i}>
                    {date(ev.createdAt, locale)} · {REQUEST_STATUS_LABELS[ev.status][locale]}
                    {ev.note ? ` – ${ev.note}` : ""}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
    </>
  );
}
