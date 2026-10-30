"use client";

import { c_internalCoursesPanel } from "@/lib/i18n/components/internalCoursesPanel";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileDropZone } from "@/components/FileDropZone";
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
  const [files, setFiles] = useState<File[]>([]);
  const [storedIds, setStoredIds] = useState<string[]>([]);
  const [fileProblems, setFileProblems] = useState<{ filename: string; message: string; findings?: { kind: string; label: string; pageNumber: number; line: number }[] }[]>([]);
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
      setError(data?.error ?? (c_internalCoursesPanel(de).thatDidNotWork));
      return false;
    }
    await refresh();
    return true;
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFileProblems([]);
    setBusy(true);
    const form = new FormData();
    form.set("title", title.trim());
    form.set("language", locale);
    form.set("includeSectionQuizzes", String(includeSectionQuizzes));
    form.set("includeFinalExam", String(includeFinalExam));
    for (const f of files) form.append("files", f);
    for (const id of storedIds) form.append("documentIds", id);
    let res: Response;
    try {
      res = await fetch("/api/internal-courses", { method: "POST", body: form });
    } catch {
      setBusy(false);
      setError(c_internalCoursesPanel(de).uploadFailedPleaseTryAgain);
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? (c_internalCoursesPanel(de).thatDidNotWork));
      if (Array.isArray(data?.files)) setFileProblems(data.files);
      return;
    }
    setTitle("");
    setFiles([]);
    setStoredIds([]);
    await refresh();
  }

  const statusLabel = (s: Course["catalogStatus"]) =>
    s === "approved" ? (c_internalCoursesPanel(de).approved) : c_internalCoursesPanel(de).draftAwaitingReview;

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="internal-courses">
      <h2 className="text-lg font-medium">{c_internalCoursesPanel(de).internalLearning}</h2>
      <p className="mt-1 text-sm text-muted">
        {c_internalCoursesPanel(de).theAiDraftsACourse}
      </p>

      {error && <p role="alert" data-testid="internal-error" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}

      {!aiConfigured && (
        <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm" data-testid="internal-ai-missing">
          {c_internalCoursesPanel(de).aCompanyAdminMustFirst}
        </p>
      )}

      <form onSubmit={start} className="mt-4 flex flex-col gap-3">
        <FileDropZone files={files} onChange={setFiles} locale={locale} maxFiles={50} maxBytes={10 * 1024 * 1024} disabled={busy} testId="internal-drop" />
        <p className="text-xs text-muted" data-testid="internal-files-hint">
          {c_internalCoursesPanel(de).upTo50FilesPer}
        </p>
        {usable.length > 0 && (
          <details className="text-sm" data-testid="internal-stored">
            <summary className="cursor-pointer text-text-2">
              {fill(c_internalCoursesPanel(de).addStoredDocuments0Selected, storedIds.length)}
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {usable.map((d) => (
                <li key={d.id}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={storedIds.includes(d.id)} onChange={(e) => setStoredIds(e.target.checked ? [...storedIds, d.id] : storedIds.filter((x) => x !== d.id))} />
                    {d.title}
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}
        {fileProblems.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text" data-testid="internal-file-problems">
            {fileProblems.map((p, i) => (
              <li key={i}>
                <span className="font-medium">{p.filename}</span>: {p.message}
                {p.findings?.map((f, k) => (
                  <span key={k} className="block pl-3 text-xs">{f.label} ({c_internalCoursesPanel(de).page} {f.pageNumber}, {c_internalCoursesPanel(de).line} {f.line})</span>
                ))}
              </li>
            ))}
            <li className="text-xs">
              {c_internalCoursesPanel(de).redactTheLinesAndChoose}
            </li>
          </ul>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium">
          {c_internalCoursesPanel(de).courseTitle}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            data-testid="internal-title"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" disabled={busy || !aiConfigured || files.length + storedIds.length === 0} data-testid="internal-start" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50">
          {c_internalCoursesPanel(de).createDraft}
        </button>
        </div>
        <fieldset className="flex flex-col gap-1.5 text-sm" data-testid="internal-tests">
          <legend className="mb-1 font-medium">{c_internalCoursesPanel(de).tests}</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeSectionQuizzes} onChange={(e) => setIncludeSectionQuizzes(e.target.checked)} data-testid="internal-quizzes" />
            {c_internalCoursesPanel(de).includeLessonTests}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeFinalExam} onChange={(e) => setIncludeFinalExam(e.target.checked)} data-testid="internal-exam" />
            {c_internalCoursesPanel(de).includeFinalExam}
          </label>
          <p className="text-xs text-muted" data-testid="internal-tests-hint">
            {!includeSectionQuizzes && !includeFinalExam
              ? c_internalCoursesPanel(de).plainWalkthroughOnlyLessonsNo
              : !includeSectionQuizzes
                ? c_internalCoursesPanel(de).questionsAreCreatedForThe
                : !includeFinalExam
                  ? c_internalCoursesPanel(de).questionsAreCreatedForThe2
                  : c_internalCoursesPanel(de).lessonTestsAndFinalExam}
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
                    {c_internalCoursesPanel(de).cancel}
                  </button>
                )}
              </div>
              <p className="mt-1 text-muted">
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
                  <span className="text-muted">· {statusLabel(c.catalogStatus)}</span>
                  {!c.includeSectionQuizzes && !c.includeFinalExam && (
                    <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-xs">{c_internalCoursesPanel(de).noTests}</span>
                  )}
                </span>
                <span className="flex gap-2">
                  <Link href={`/cert/${c.slug}`} className={btn}>{c_internalCoursesPanel(de).view}</Link>
                  <Link href={`/company/courses/${c.slug}/workshop`} className={btn} data-testid="internal-workshop">{c_internalCoursesPanel(de).edit}</Link>
                  {c.catalogStatus !== "approved" && (
                    <>
                      <button type="button" className={btn} disabled={busy} data-testid="internal-approve" onClick={() => call(`/api/internal-courses/${c.id}/approve`, "POST")}>
                        {c_internalCoursesPanel(de).reviewedApprove}
                      </button>
                      <button type="button" className={btn} disabled={busy} onClick={() => call(`/api/internal-courses/${c.id}`, "DELETE")}>
                        {c_internalCoursesPanel(de).discard}
                      </button>
                    </>
                  )}
                </span>
              </div>
              <CheatSheetBackfill courseId={c.id} initial={cheatSheets.find((x) => x.certificationId === c.id)} aiConfigured={aiConfigured} locale={locale} />
              {c.catalogStatus === "approved" && c.approvedByName && c.approvedAt && (
                <p className="mt-1 text-muted">
                  {c_internalCoursesPanel(de).approvedBy} {c.approvedByName}, {new Date(c.approvedAt).toLocaleDateString(de ? "de-DE" : "en-GB")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
