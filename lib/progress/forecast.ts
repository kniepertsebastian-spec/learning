/**
 * Fortschritt sichtbar mit echten Zahlen (roadmap_motivation Phase 7): Rückblick und Einschätzung zum Prüfungstermin aus gespeicherten
 * Ständen „Lernziele sicher“. Ohne Verlauf gibt es keine Aussage; es werden nie Werte geschätzt, die nicht aus den Ständen folgen.
 */

const DAY_MS = 86_400_000;

export interface SnapshotPoint {
  /** `YYYY-MM-DD` */
  day: string;
  secure: number;
  total: number;
}

const ts = (day: string) => new Date(`${day}T12:00:00Z`).getTime();
const daysBetween = (a: string, b: string) => Math.round((ts(b) - ts(a)) / DAY_MS);

/** Mindestabstand des Vergleichsstands: Rückblick erst, wenn der älteste passende Stand mindestens so alt ist (Platzhalter: 3 Wochen). */
export const REVIEW_MIN_DAYS = 21;

export interface ProgressReview {
  then: SnapshotPoint;
  now: SnapshotPoint;
  /** Tage zwischen den beiden Ständen. */
  days: number;
  weeks: number;
  gain: number;
}

/**
 * „Vor 3 Wochen: 2 von 12 Lernzielen sicher. Heute: 9.“ Verglichen wird mit dem jüngsten Stand, der mindestens `REVIEW_MIN_DAYS` zurückliegt
 * (nicht älter als 12 Wochen); `null` ohne ausreichend langen Verlauf.
 */
export function progressReview(points: SnapshotPoint[], today: string): ProgressReview | null {
  const sorted = [...points].filter((p) => p.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1));
  const now = sorted[sorted.length - 1];
  if (!now) return null;
  const candidates = sorted.filter((p) => daysBetween(p.day, now.day) >= REVIEW_MIN_DAYS && daysBetween(p.day, today) <= 84);
  const then = candidates[candidates.length - 1];
  if (!then) return null;
  const days = daysBetween(then.day, now.day);
  return { then, now, days, weeks: Math.round(days / 7), gain: now.secure - then.secure };
}

/** Ziel für „bereit“: Anteil der Lernziele, die sicher sein sollen (Platzhalter). */
export const TARGET_SECURE_SHARE = 0.8;
/** Eine Einschätzung braucht einen Verlauf über mindestens so viele Tage. */
export const OUTLOOK_MIN_SPAN_DAYS = 7;

export type Outlook = { status: "on_track" | "tight"; projected: number; target: number; perWeek: number } | { status: "done" } | null;

/**
 * Einschätzung zum Prüfungstermin (nur für die Person): Hochrechnung des bisherigen Tempos der letzten 6 Wochen. `null`, wenn kein Termin in der
 * Zukunft liegt oder der Verlauf zu kurz ist.
 */
export function examOutlook(points: SnapshotPoint[], today: string, examDay: string | null): Outlook {
  if (!examDay || examDay <= today) return null;
  const recent = [...points].filter((p) => p.day <= today && daysBetween(p.day, today) <= 42).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const span = daysBetween(first.day, last.day);
  if (span < OUTLOOK_MIN_SPAN_DAYS) return null;
  const target = Math.ceil(last.total * TARGET_SECURE_SHARE);
  if (last.secure >= target) return { status: "done" };
  const perDay = Math.max(0, (last.secure - first.secure) / span);
  const projected = Math.min(last.total, Math.round(last.secure + perDay * daysBetween(today, examDay)));
  return { status: projected >= target ? "on_track" : "tight", projected, target, perWeek: Math.round(perDay * 7 * 10) / 10 };
}
