"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheatSheetBackfill, type CheatSheetStatusView } from "@/components/CheatSheetBackfill";

type Job = { id: string; title: string; status: string; message: string | null; errorMessage: string | null; active: boolean; createdAt: string };
type Course = { id: string; slug: string; name: string; catalogStatus: "draft" | "in_review" | "approved"; includeSectionQuizzes: boolean; includeFinalExam: boolean; approvedByName: string | null; approvedAt: string | null; createdAt: string };
type DocumentOption = { id: string; title: string; excludeFromAi: boolean };

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";

/**
 * Interne Lernpfade: aus einem Firmendokument erstellt die KI einen Entwurf, Mentor oder Firmen-Admin prüft ihn
 * und gibt ihn frei. Erst danach sehen ihn Lernende und er lässt sich zuweisen. Der Betreiber sieht nichts davon.
 */
export function InternalCoursesPanel({
  documents,
  initialJobs,
  initialCourses,
  cheatSheets,
  aiConfigured,
  locale,
}: {
  documents: DocumentOption[];
  initialJobs: Job[];
  initialCourses: Course[];
  cheatSheets: CheatSheetStatusView[];
  aiConfigured: boolean;
  locale: "de" | "en";
}) {
  const de = locale === "de";
  const [jobs, setJobs] = useState(initialJobs);
  const [courses, setCourses] = useState(initialCourses);
  const [documentId, setDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [includeSectionQuizzes, setIncludeSectionQuizzes] = useState(true);
  const [includeFinalExam, setIncludeFinalExam] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usable = documents.filter((d) => !d.excludeFromAi);
  const anyActive = jobs.some((j) => j.active);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/internal-courses", { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    setJobs(body.jobs);
    setCourses(body.courses);
  }, []);

  // Solange ein Auftrag läuft, alle 3 Sekunden den Stand holen.
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [anyActive, refresh]);

  async function call(url: string, method: "POST" | "DELETE", body?: unknown) {
    setError(null);
    setBusy(true);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? (de ? "Das hat nicht geklappt." : "That did not work."));
      return false;
    }
    await refresh();
    return true;
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/internal-courses", "POST", { documentId, title: title.trim(), language: locale, includeSectionQuizzes, includeFinalExam })) setTitle("");
  }

  const statusLabel = (s: Course["catalogStatus"]) =>
    s === "approved" ? (de ? "Freigegeben" : "Approved") : de ? "Entwurf – wartet auf Prüfung" : "Draft – awaiting review";

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="internal-courses">
      <h2 className="text-lg font-medium">{de ? "Interne Lernpfade" : "Internal learning paths"}</h2>
      <p className="mt-1 text-sm text-foreground/70">
        {de
          ? "Aus einem Firmendokument erstellt die KI einen Entwurf. Ihr prüft ihn und gebt ihn frei; erst dann sehen ihn Lernende und er lässt sich zuweisen. Wir sehen weder Dokument noch Lernpfad."
          : "The AI drafts a learning path from a company document. You review and approve it; only then can learners see and be assigned to it. We see neither the document nor the path."}
      </p>

      {error && <p role="alert" data-testid="internal-error" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}

      {!aiConfigured && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm" data-testid="internal-ai-missing">
          {de ? "Zuerst muss der Firmen-Admin unten den KI-Zugang einrichten." : "A company admin must first set up the AI access below."}
        </p>
      )}

      <form onSubmit={start} className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium">
          {de ? "Dokument" : "Document"}
          <select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            required
            data-testid="internal-document"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{usable.length ? (de ? "Bitte wählen …" : "Choose …") : de ? "Kein Dokument für die KI verfügbar" : "No document available for AI"}</option>
            {usable.map((d) => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-sm font-medium">
          {de ? "Titel des Lernpfads" : "Learning path title"}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            data-testid="internal-title"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" disabled={busy || !aiConfigured || !documentId} data-testid="internal-start" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {de ? "Entwurf erstellen" : "Create draft"}
        </button>
        </div>
        <fieldset className="flex flex-col gap-1.5 text-sm" data-testid="internal-tests">
          <legend className="mb-1 font-medium">{de ? "Tests" : "Tests"}</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeSectionQuizzes} onChange={(e) => setIncludeSectionQuizzes(e.target.checked)} data-testid="internal-quizzes" />
            {de ? "Lektionstests integrieren" : "Include lesson tests"}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeFinalExam} onChange={(e) => setIncludeFinalExam(e.target.checked)} data-testid="internal-exam" />
            {de ? "Abschlussprüfung integrieren" : "Include final exam"}
          </label>
          <p className="text-xs text-foreground/70" data-testid="internal-tests-hint">
            {!includeSectionQuizzes && !includeFinalExam
              ? de
                ? "Reiner Durchlauf: Es entstehen nur Lektionen, keine Fragen (das ist deutlich günstiger). Der Lernpfad gilt als abgeschlossen, sobald alle Lektionen durchgearbeitet sind."
                : "Plain walkthrough: only lessons, no questions (much cheaper). The path counts as completed once all lessons are worked through."
              : !includeSectionQuizzes
                ? de
                  ? "Fragen entstehen nur für die Abschlussprüfung. Lektionen werden ohne Test abgeschlossen; die Prüfung ist eine Selbstkontrolle und zählt nicht für den Abschluss."
                  : "Questions are created for the final exam only. Lessons are completed without a test; the exam is a self-check and does not count towards completion."
                : !includeFinalExam
                  ? de
                    ? "Fragen entstehen für die Lektionstests; es gibt keine Abschlussprüfung."
                    : "Questions are created for the lesson tests; there is no final exam."
                  : de
                    ? "Lektionstests und Abschlussprüfung (Standard). Der Lernpfad gilt als abgeschlossen, wenn jedes Lernziel beherrscht wird."
                    : "Lesson tests and final exam (default). The path counts as completed once every objective is mastered."}
          </p>
        </fieldset>
      </form>

      {jobs.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2" data-testid="internal-jobs">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{j.title}</span>
                {j.active && (
                  <button type="button" className={btn} disabled={busy} onClick={() => call(`/api/internal-courses/jobs/${j.id}/cancel`, "POST")}>
                    {de ? "Abbrechen" : "Cancel"}
                  </button>
                )}
              </div>
              <p className="mt-1 text-foreground/70">
                {j.errorMessage ?? j.message ?? j.status}
              </p>
            </li>
          ))}
        </ul>
      )}

      {courses.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2" data-testid="internal-courses-list">
          {courses.map((c) => (
            <li key={c.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{c.name}</span>{" "}
                  <span className="text-foreground/70">· {statusLabel(c.catalogStatus)}</span>
                  {!c.includeSectionQuizzes && !c.includeFinalExam && (
                    <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-xs">{de ? "ohne Tests" : "no tests"}</span>
                  )}
                </span>
                <span className="flex gap-2">
                  <Link href={`/cert/${c.slug}`} className={btn}>{de ? "Ansehen" : "View"}</Link>
                  {c.catalogStatus !== "approved" && (
                    <>
                      <button type="button" className={btn} disabled={busy} data-testid="internal-approve" onClick={() => call(`/api/internal-courses/${c.id}/approve`, "POST")}>
                        {de ? "Geprüft – freigeben" : "Reviewed – approve"}
                      </button>
                      <button type="button" className={btn} disabled={busy} onClick={() => call(`/api/internal-courses/${c.id}`, "DELETE")}>
                        {de ? "Verwerfen" : "Discard"}
                      </button>
                    </>
                  )}
                </span>
              </div>
              <CheatSheetBackfill courseId={c.id} initial={cheatSheets.find((x) => x.certificationId === c.id)} aiConfigured={aiConfigured} locale={locale} />
              {c.catalogStatus === "approved" && c.approvedByName && c.approvedAt && (
                <p className="mt-1 text-foreground/70">
                  {de ? "Freigegeben von" : "Approved by"} {c.approvedByName}, {new Date(c.approvedAt).toLocaleDateString(de ? "de-DE" : "en-GB")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
