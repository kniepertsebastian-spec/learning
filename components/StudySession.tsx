"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { AnswerConfidence, Locale } from "@/lib/types";
import { enqueueSyncEvent } from "@/lib/client/sync-queue";

const CONFIDENCE_LABEL: Record<AnswerConfidence, { de: string; en: string }> = {
  guessed: { de: "Geraten", en: "Guessed" },
  unsure: { de: "Unsicher", en: "Unsure" },
  sure: { de: "Sicher", en: "Sure" },
};

interface SessionQuestionItem {
  itemId: string;
  category: "review" | "weak" | "new";
  questionId: string;
  question: { de: string; en: string };
  /** isCorrect ist nur im Offline-Paket gesetzt (siehe offline-Prop unten) -
   * im Live-Fall bleibt Korrektheit serverseitig geprüft. */
  options: Array<{ id: string; text: { de: string; en: string }; orderNum: number; isCorrect?: boolean }>;
}

interface SessionLessonItem {
  itemId: string;
  sectionId: string;
  title: { de: string; en: string };
}

interface StudySessionResult {
  score: number;
  results: Array<{ itemId: string; isCorrect: boolean }>;
}

interface StudySessionProps {
  certSlug: string;
  sessionId: string;
  questionItems: SessionQuestionItem[];
  lessonItems: SessionLessonItem[];
  locale: Locale;
  /** R4.3 (roadmap.md): im Offline-Reader gesetzt - reiht das Ergebnis statt
   * eines Live-POST in die lokale Sync-Warteschlange ein und berechnet den
   * Score direkt clientseitig aus den mitgelieferten isCorrect-Werten. */
  offline?: { userId: string };
}

const CATEGORY_LABEL: Record<SessionQuestionItem["category"], { de: string; en: string }> = {
  review: { de: "Wiederholung", en: "Review" },
  weak: { de: "Schwacher Bereich", en: "Weak area" },
  new: { de: "Neu", en: "New" },
};

/**
 * R2.3/R2.4 (roadmap.md): nimmt eine vom Session Builder zusammengestellte
 * Session entgegen (Fragen + optionale Lesson-Fallback-Items) und wertet sie
 * aus - "Nach der Session eine kurze, motivierende Zusammenfassung zeigen"
 * (R2.4).
 */
export function StudySession({
  certSlug,
  sessionId,
  questionItems,
  lessonItems,
  locale,
  offline,
}: StudySessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<string | null>>(() => questionItems.map(() => null));
  const [confidences, setConfidences] = useState<Array<AnswerConfidence | null>>(() =>
    questionItems.map(() => null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<StudySessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting || result) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      answers: questionItems.map((item, i) => ({
        itemId: item.itemId,
        selectedOptionId: answers[i] ?? "",
        confidence: confidences[i] ?? undefined,
      })),
    };

    if (offline) {
      const results = questionItems.map((item, i) => ({
        itemId: item.itemId,
        isCorrect: item.options.some((o) => o.id === answers[i] && o.isCorrect),
      }));
      const score =
        results.length > 0
          ? Math.round((results.filter((r) => r.isCorrect).length / results.length) * 100)
          : 0;
      await enqueueSyncEvent(
        offline.userId,
        "study_session",
        { sessionId, answers: payload.answers },
        locale === "de" ? "Tages-Session" : "Today's session",
      ).catch(() => {});
      setResult({ score, results });
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`/api/study-sessions/${sessionId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || (locale === "de" ? "Einreichen fehlgeschlagen." : "Failed to submit."));
        setSubmitting(false);
        return;
      }
      setResult(data);
    } catch {
      setError(locale === "de" ? "Einreichen fehlgeschlagen." : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  if (questionItems.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-1 flex-col py-8">
        <h1 className="mb-4 text-xl font-semibold">
          {locale === "de" ? "Empfohlene Lektionen" : "Recommended lessons"}
        </h1>
        {lessonItems.length > 0 ? (
          <LessonList certSlug={certSlug} lessonItems={lessonItems} locale={locale} />
        ) : (
          <p className="text-sm text-foreground/70">
            {locale === "de"
              ? "Für heute gibt es nichts zu lernen - schau später wieder vorbei."
              : "Nothing to study right now - check back later."}
          </p>
        )}
        <Link href={`/cert/${certSlug}`} className="mt-6 text-sm text-accent hover:underline">
          {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
        </Link>
      </div>
    );
  }

  if (result) {
    const correctCount = result.results.filter((r) => r.isCorrect).length;
    return (
      <div className="mx-auto flex max-w-2xl flex-1 flex-col py-8">
        <div className="mb-6 rounded-lg border border-border bg-surface p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" aria-hidden="true" />
          <p className="mb-1 text-3xl font-bold">{result.score}%</p>
          <p className="text-sm text-foreground/70">
            {locale === "de"
              ? `${correctCount} von ${result.results.length} richtig`
              : `${correctCount} of ${result.results.length} correct`}
          </p>
          <p className="mt-3 text-sm font-medium text-accent">
            {locale === "de" ? "Gut gemacht - weiter so!" : "Well done - keep it up!"}
          </p>
          {offline && (
            <p className="mt-3 text-xs text-foreground/50">
              {locale === "de"
                ? "Offline-Modus: Dieses Ergebnis wird synchronisiert, sobald du wieder online bist."
                : "Offline mode: this result will sync once you're back online."}
            </p>
          )}
        </div>

        {lessonItems.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-medium">
              {locale === "de" ? "Empfohlene Lektionen" : "Recommended lessons"}
            </h2>
            <LessonList certSlug={certSlug} lessonItems={lessonItems} locale={locale} />
          </div>
        )}

        <Link
          href={`/cert/${certSlug}`}
          className="mx-auto rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
        </Link>
      </div>
    );
  }

  const item = questionItems[currentIndex];

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {locale === "de" ? "Frage" : "Question"} {currentIndex + 1} / {questionItems.length}
        </p>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
          {CATEGORY_LABEL[item.category][locale]}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <p className="mb-4 font-medium">{item.question[locale]}</p>
        <div className="flex flex-col gap-2">
          {[...item.options]
            .sort((a, b) => a.orderNum - b.orderNum)
            .map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  setAnswers((prev) => {
                    const next = [...prev];
                    next[currentIndex] = option.id;
                    return next;
                  })
                }
                className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                  answers[currentIndex] === option.id
                    ? "border-accent bg-accent/10"
                    : "border-border hover:bg-background"
                }`}
              >
                {option.text[locale]}
              </button>
            ))}
        </div>

        {answers[currentIndex] && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-foreground/60">
              {locale === "de" ? "Wie sicher warst du dir?" : "How sure were you?"}
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CONFIDENCE_LABEL) as AnswerConfidence[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() =>
                    setConfidences((prev) => {
                      const next = [...prev];
                      next[currentIndex] = level;
                      return next;
                    })
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    confidences[currentIndex] === level
                      ? "border-accent bg-accent/10"
                      : "border-border hover:bg-background"
                  }`}
                >
                  {CONFIDENCE_LABEL[level][locale]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
        >
          {locale === "de" ? "Zurück" : "Previous"}
        </button>

        {currentIndex + 1 >= questionItems.length ? (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {locale === "de" ? "Session abschließen" : "Finish session"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => Math.min(questionItems.length - 1, i + 1))}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {locale === "de" ? "Weiter" : "Next"}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function LessonList({
  certSlug,
  lessonItems,
  locale,
}: {
  certSlug: string;
  lessonItems: SessionLessonItem[];
  locale: Locale;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {lessonItems.map((lesson) => (
        <li key={lesson.itemId}>
          <Link
            href={`/cert/${certSlug}/section/${lesson.sectionId}`}
            className="block rounded-md border border-border px-3 py-2 text-sm hover:border-accent hover:bg-background"
          >
            {lesson.title[locale]}
          </Link>
        </li>
      ))}
    </ul>
  );
}
