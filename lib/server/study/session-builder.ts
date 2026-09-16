import type { StudyGoalType } from "@/lib/server/db/schema";

/**
 * R2.3 (roadmap.md): reine Berechnungslogik des Session Builders - kein
 * DB-Zugriff, damit sie ohne laufende DB testbar ist (dieselbe Trennung wie
 * bei lib/server/admin/blueprint.ts / lib/server/review/scheduler.ts). Die
 * DB-anbindende Seite (Fragen auswählen, Session persistieren) lebt in
 * lib/server/study/session-service.ts.
 */

/** Ungefährer Zeitaufwand für EINE Session-Frage inkl. Lesen, Antworten und
 * Feedback - deutlich kürzer als der Exam-Pacing-Wert aus
 * lib/server/exam/blueprint.ts (dort geht es um Prüfungsbedingungen, hier um
 * schnelles Wiederholen mit sofortigem Feedback). Reine Schätzung für die
 * Minuten<->Fragen-Umrechnung, keine exakte Vorhersage. */
export const MINUTES_PER_SESSION_QUESTION = 1.5;

/**
 * "Session anhand des Zeitbudgets erstellen" (roadmap.md): übersetzt das
 * Tagesziel aus study_profiles in eine Ziel-Fragenanzahl. Bei einem
 * Fragenziel direkt der gespeicherte Wert, bei einem Zeitziel eine grobe
 * Umrechnung über MINUTES_PER_SESSION_QUESTION.
 */
export function estimateTargetQuestionCount(goalType: StudyGoalType, goalValue: number): number {
  if (goalType === "questions") return Math.max(1, Math.round(goalValue));
  return Math.max(1, Math.round(goalValue / MINUTES_PER_SESSION_QUESTION));
}

/** Kehrt estimateTargetQuestionCount() um - für die geschätzte Dauer einer
 * bereits gebauten Session (R2.4: "Primäre CTA mit geschätzter Dauer"). */
export function estimateSessionMinutes(questionCount: number): number {
  return Math.max(1, Math.round(questionCount * MINUTES_PER_SESSION_QUESTION));
}

export interface SessionComposition {
  review: number;
  weak: number;
  new: number;
}

/**
 * "Empfohlener Startmix: 60 % fällige Wiederholungen, 25 % schwache
 * Bereiche, 15 % neuer Stoff" + "Neue Inhalte begrenzen, wenn viele
 * Wiederholungen überfällig sind" (beide roadmap.md, Letzteres ursprünglich
 * unter R2.2 gelistet, aber strukturell Teil der Session-Zusammenstellung -
 * siehe Notiz dort). Verteilt `targetQuestionCount` auf die drei Kategorien,
 * begrenzt durch die tatsächlich verfügbaren Pools, und schiebt einen nicht
 * erreichten Anteil (zu kleiner Pool) auf die jeweils nächste Kategorie
 * weiter, damit die Session trotzdem möglichst nah am Tagesziel bleibt -
 * das ist NICHT der "zu kleiner Fragenpool insgesamt"-Fallback auf Lessons
 * (siehe buildLessonFallbackCount unten), sondern reine Umverteilung
 * zwischen den drei Fragen-Kategorien.
 */
export function computeSessionComposition(
  targetQuestionCount: number,
  dueCount: number,
  weakPoolSize: number,
  newPoolSize: number,
): SessionComposition {
  let reviewTarget = Math.round(targetQuestionCount * 0.6);
  const weakTarget = Math.round(targetQuestionCount * 0.25);
  let newTarget = Math.max(0, targetQuestionCount - reviewTarget - weakTarget);

  // Rückstau an Wiederholungen: mehr fällig als der reguläre Anteil abdeckt
  // -> neuer Stoff tritt zurück, die frei werdenden Plätze gehen an Review.
  if (dueCount > reviewTarget) {
    reviewTarget += newTarget;
    newTarget = 0;
  }

  const review = Math.min(reviewTarget, dueCount);
  const weak = Math.min(weakTarget, weakPoolSize);

  // Was Review/Weak mangels Pool nicht erreichen, darf neuer Stoff auffüllen
  // (in dieser Reihenfolge: Review-Lücke zuerst, dann Weak-Lücke), damit ein
  // kleiner Wiederholungs- oder Schwachstellen-Pool nicht automatisch eine
  // kleinere Session bedeutet, solange genug neuer Stoff verfügbar ist.
  const shortfall = reviewTarget - review + (weakTarget - weak);
  const newCount = Math.min(newTarget + shortfall, newPoolSize);

  return { review, weak, new: newCount };
}

/**
 * Verschiebt neuen Stoff zugunsten von Wiederholung/Schwachstellen - aber
 * nur soweit dort tatsächlich noch Plätze frei sind (`dueAvailable`/
 * `weakAvailable` = tatsächlich abrufbare Fragen, nicht das ursprüngliche
 * Ziel), damit die Session nie mehr Fragen verspricht, als am Ende
 * tatsächlich befüllt werden können. Review zuerst auffüllen, dann Weak -
 * was danach an neuem Stoff übrig bleibt, bleibt neuer Stoff (besser als
 * Plätze ungenutzt zu lassen).
 *
 * Drei roadmap.md-Auslöser teilen sich denselben Hebel, daher ein
 * gemeinsamer, auslöserunabhängiger Name statt einer "ExamUrgency"-Funktion,
 * die auch für Energie/Comeback zweckentfremdet würde:
 * - "Prüfungstermin ... in die Priorisierung einbeziehen" (Prüfung steht
 *   bald an - neuer, noch nicht gefestigter Stoff ist riskanter).
 * - "optionaler Energiezustand" (wenig Energie -> vertrautes Wiederholen
 *   statt anstrengendem Neuem).
 * - "sanfter Comeback-Modus nach Pause" (nach einer Lernpause ist
 *   Wiedereinstieg über Bekanntes leichter als über neuen Stoff).
 */
export function reallocateTowardFamiliarContent(
  composition: SessionComposition,
  dueAvailable: number,
  weakAvailable: number,
): SessionComposition {
  let { review, weak } = composition;
  let reclaimable = composition.new;

  const reviewHeadroom = Math.max(0, dueAvailable - review);
  const addToReview = Math.min(reclaimable, reviewHeadroom);
  review += addToReview;
  reclaimable -= addToReview;

  const weakHeadroom = Math.max(0, weakAvailable - weak);
  const addToWeak = Math.min(reclaimable, weakHeadroom);
  weak += addToWeak;
  reclaimable -= addToWeak;

  return { review, weak, new: reclaimable };
}

/**
 * "Bei zu kleinem Fragenpool auf Lesson-Wiederholung ... zurückfallen"
 * (roadmap.md): wie viele Lesson-Filler-Items zusätzlich gebraucht werden,
 * wenn die drei Fragen-Kategorien zusammen das Tagesziel nicht erreichen
 * (alle Pools erschöpft, nicht nur einzelne).
 */
export function computeLessonFallbackCount(
  targetQuestionCount: number,
  composition: SessionComposition,
): number {
  const total = composition.review + composition.weak + composition.new;
  return Math.max(0, targetQuestionCount - total);
}

/**
 * "Lernserie" (R2.4): Anzahl aufeinanderfolgender Kalendertage bis
 * einschließlich `today`, an denen mindestens eine Session abgeschlossen
 * wurde. `completedDates` muss nicht sortiert oder dedupliziert sein.
 * Ein an `today` selbst noch nicht abgeschlossener Tag unterbricht die Serie
 * NICHT (die Serie zählt bis gestern weiter, bis der heutige Tag entweder
 * abgeschlossen oder komplett verstrichen ist) - sonst würde die Anzeige
 * schon morgens auf 0 zurückfallen, bevor überhaupt Zeit zum Lernen war.
 */
export function computeStreak(completedDates: Date[], today: Date = new Date()): number {
  const dayKeys = new Set(completedDates.map((d) => toDayKey(d)));
  const todayKey = toDayKey(today);

  let streak = 0;
  let cursor = new Date(today);
  if (!dayKeys.has(todayKey)) {
    // Heute noch nicht gelernt - bei gestern weiterzählen, aber nur, wenn
    // gestern (oder früher) tatsächlich gelernt wurde; sonst ist die Serie 0.
    cursor.setDate(cursor.getDate() - 1);
  }

  while (dayKeys.has(toDayKey(cursor))) {
    streak++;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/** UTC-Kalendertag als "YYYY-MM-DD" - exportiert, weil session-service.ts
 * dieselbe Tagesgrenze braucht, um zu entscheiden, ob eine bereits
 * abgeschlossene/ausgesetzte Session von HEUTE stammt (dann keine neue
 * bauen) oder von einem früheren Tag (dann schon). */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Ab dieser Lücke (in Kalendertagen) seit der letzten abgeschlossenen/
 * ausgesetzten Session gilt der Wiedereinstieg als "nach einer Pause" -
 * 3 Tage, deutlich über einer normalen Lernpause an einem einzelnen Tag,
 * aber noch früh genug, um den sanften Wiedereinstieg zu rechtfertigen. */
export const COMEBACK_GAP_DAYS = 3;

/**
 * "Sanfter Comeback-Modus nach Pause" (R2, roadmap.md). `lastActivityAt`
 * ist der Zeitpunkt der letzten abgeschlossenen/ausgesetzten Session dieser
 * Zertifizierung, `null` wenn es noch nie eine gab - eine ERSTE Session ist
 * kein "Comeback" (dafür fehlt ja eine vorherige Aktivität, zu der man
 * zurückkehrt), sondern schlicht ein normaler Einstieg.
 */
export function isComebackSession(lastActivityAt: Date | null, now: Date = new Date()): boolean {
  if (!lastActivityAt) return false;
  const gapMs = now.getTime() - lastActivityAt.getTime();
  return gapMs >= COMEBACK_GAP_DAYS * 24 * 60 * 60 * 1000;
}
