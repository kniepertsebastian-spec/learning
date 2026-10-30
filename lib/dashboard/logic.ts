/** Reine Rechenlogik des Lern-Dashboards (docs/ROADMAP-UI.md U3), ohne Datenbankzugriff. */

export type GreetingPart = "morning" | "day" | "evening";

export function greetingPart(hour: number): GreetingPart {
  if (hour < 11) return "morning";
  if (hour < 18) return "day";
  return "evening";
}

export type CertState = "planned" | "started" | "not_started" | "completed";

export function certState(input: { total: number; done: number; hasActivity: boolean; examInDays: number | null }): CertState {
  if (input.total > 0 && input.done >= input.total) return "completed";
  if (input.examInDays !== null && input.examInDays >= 0) return "planned";
  if (input.done > 0 || input.hasActivity) return "started";
  return "not_started";
}

/** „Kurs abbrechen“: ein abgebrochener Kurs verschwindet aus dem Dashboard, außer die Firma hat ihn zugewiesen (Pflicht). */
export function hiddenByAbandonment(abandoned: boolean, assigned: boolean): boolean {
  return abandoned && !assigned;
}

export function daysUntil(date: Date | null, now: Date): number | null {
  if (!date) return null;
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day(date) - day(now)) / 86_400_000);
}

export type DomainLight = "strong" | "practice" | "weak";

/** Ampel je Domain aus dem Anteil beherrschter Lernziele (stark ab 70 %, üben ab 40 %). */
export function domainLight(masteryPercent: number): DomainLight {
  if (masteryPercent >= 70) return "strong";
  if (masteryPercent >= 40) return "practice";
  return "weak";
}

/** Prozent beherrschter Lernziele: STRONG zählt voll, OK halb (wie die Kursseite). */
export function masteryPercent(strong: number, ok: number, total: number): number {
  return total > 0 ? Math.round(((strong * 100 + ok * 50) / (total * 100)) * 100) : 0;
}

/** Die nächste noch nicht erledigte Sektion nach der zuletzt bearbeiteten (Reihenfolge im Kurs); sonst die erste offene; sonst die letzte bearbeitete. */
export function pickContinueIndex(ordered: Array<{ id: string; done: boolean }>, lastTouchedId: string | null): number {
  if (ordered.length === 0) return -1;
  const last = lastTouchedId ? ordered.findIndex((s) => s.id === lastTouchedId) : -1;
  for (let i = last + 1; i < ordered.length; i++) if (!ordered[i].done) return i;
  const first = ordered.findIndex((s) => !s.done);
  if (first >= 0) return first;
  return last >= 0 ? last : ordered.length - 1;
}

/** Montag (UTC) der Woche von `now`. */
export function weekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mo = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

/** Beantwortete Fragen je Tag Mo–So der laufenden Woche. */
export function weekBars(events: Date[], now: Date): { counts: number[]; todayIndex: number } {
  const start = weekStart(now).getTime();
  const counts = Array(7).fill(0) as number[];
  for (const e of events) {
    const i = Math.floor((e.getTime() - start) / 86_400_000);
    if (i >= 0 && i < 7) counts[i]++;
  }
  return { counts, todayIndex: Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86_400_000) };
}

/** Trefferquote in Prozent; `null` ohne Antworten. */
export function accuracy(answers: Array<{ correct: boolean }>): number | null {
  return answers.length ? Math.round((answers.filter((a) => a.correct).length / answers.length) * 100) : null;
}

/** Kurzcode für die Kachel: gepflegter Kurzcode, sonst Anfangsbuchstaben der Wörter (höchstens 4). */
export function shortCodeOf(name: string, shortCode: string | null): string {
  if (shortCode?.trim()) return shortCode.trim().slice(0, 6);
  const letters = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w[0].toUpperCase()).join("");
  return letters.slice(0, 4) || "?";
}

/** Kalendertag (UTC) als „YYYY-MM-DD“, passend zu `learning_time.day` und den Wochenbalken. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type MonthCell = { key: string; day: number; inMonth: boolean };

/** Monatsraster Mo–So (UTC) des Monats von `now`, aufgefüllt mit Tagen aus Vor- und Folgemonat zu vollen Wochen. */
export function monthGrid(now: Date): { year: number; month: number; cells: MonthCell[] } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;
  const cells: MonthCell[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    cells.push({ key: dayKey(d), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month });
  }
  return { year, month, cells };
}
