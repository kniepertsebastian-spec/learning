import { MIN_INTERRUPTION_MS, type Interruptions } from "@/lib/interruptions";

/**
 * Zählt Wechsel in den Hintergrund während einer Lernsitzung (Aufgabe 12, Faktor 4.3). Ein Wechsel zählt, wenn die Seite
 * mindestens `MIN_INTERRUPTION_MS` verborgen war; gezählt wird beim Zurückkommen. Reine Klasse ohne Browser-Zugriff, damit sie sich
 * mit einer Testuhr prüfen lässt; `useInterruptionCounter` bindet sie ein.
 */
export class InterruptionCounter {
  private hiddenSince: number | null;
  private count = 0;
  private totalMs = 0;

  constructor(
    private readonly now: () => number = () => performance.now(),
    startHidden = false,
  ) {
    this.hiddenSince = startHidden ? now() : null;
  }

  setHidden(hidden: boolean): void {
    if (hidden) {
      if (this.hiddenSince === null) this.hiddenSince = this.now();
      return;
    }
    if (this.hiddenSince === null) return;
    const ms = this.now() - this.hiddenSince;
    this.hiddenSince = null;
    if (ms >= MIN_INTERRUPTION_MS) {
      this.count += 1;
      this.totalMs += ms;
    }
  }

  /** Abgeschlossene Wechsel bis jetzt (ein laufender zählt noch nicht). */
  snapshot(): Interruptions {
    return { count: this.count, totalMs: Math.round(this.totalMs) };
  }

  /** Stellt den Stand vor einer Pause wieder her; die Zählung läuft danach weiter. */
  restore(previous: Interruptions | null | undefined): void {
    if (!previous) return;
    this.count += previous.count;
    this.totalMs += previous.totalMs;
  }
}
