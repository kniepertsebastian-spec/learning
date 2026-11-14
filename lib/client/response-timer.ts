/**
 * Antwortzeit je Frage (Aufgabe 06a, Review 12.11.2026): die Zeit von der Anzeige der Frage bis zur Antwort. Zeit, in der die Seite
 * im Hintergrund war (Tab-Wechsel, App im Hintergrund, gesperrter Bildschirm), zählt nicht: sie wäre sonst kein Nachdenken,
 * sondern Abwesenheit. Der Wert ist roh; Grenzen und Ausreißer behandelt der Server (Aufgabe 06b).
 *
 * Eine Frage kann mehrmals angezeigt werden (Zurückblättern in der Prüfung): die Zeiten addieren sich. Wird die Antwort geändert,
 * gilt der Zeitpunkt der letzten Antwort.
 *
 * Reine Klasse ohne React und ohne Browser-Zugriff, damit sie sich mit einer Testuhr prüfen lässt; `useResponseTimer` bindet sie ein.
 */
export class ResponseTimer {
  private current: string | number | null = null;
  /** Beginn des laufenden Abschnitts; null, solange die Seite im Hintergrund ist oder keine Frage angezeigt wird. */
  private runningSince: number | null = null;
  private hidden: boolean;
  private readonly accumulated = new Map<string | number, number>();
  private readonly answered = new Map<string | number, number>();

  constructor(
    private readonly now: () => number = () => performance.now(),
    startHidden = false,
  ) {
    this.hidden = startHidden;
  }

  /** Die Frage wird angezeigt. Beendet den Abschnitt der vorherigen Frage. */
  show(key: string | number): void {
    if (this.current === key) return;
    this.flush();
    this.current = key;
    if (!this.hidden) this.runningSince = this.now();
  }

  /** Die Seite wechselt in den Hintergrund (`true`) oder kommt zurück (`false`). */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) this.flush();
    else if (this.current !== null) this.runningSince = this.now();
  }

  /**
   * Die Frage wurde beantwortet: hält die bisherige Zeit fest und gibt sie in ganzen Millisekunden zurück. Ohne Schlüssel gilt die
   * angezeigte Frage. Zeigt keine Frage an, ist das Ergebnis `undefined`.
   */
  answer(key: string | number | null = this.current): number | undefined {
    if (key === null) return undefined;
    if (key === this.current) this.flush(true);
    const ms = Math.round(this.accumulated.get(key) ?? 0);
    this.answered.set(key, ms);
    return ms;
  }

  /** Festgehaltene Zeit einer beantworteten Frage. */
  get(key: string | number): number | undefined {
    return this.answered.get(key);
  }

  /** Stellt eine früher festgehaltene Zeit wieder her (z. B. beim Fortsetzen einer pausierten Sitzung). */
  restore(key: string | number, ms: number): void {
    if (Number.isFinite(ms) && ms >= 0) this.answered.set(key, Math.round(ms));
  }

  /** Schließt den laufenden Abschnitt ab. Mit `keepRunning` läuft die Uhr für dieselbe Frage sofort weiter. */
  private flush(keepRunning = false): void {
    if (this.current !== null && this.runningSince !== null) {
      const t = this.now();
      this.accumulated.set(this.current, (this.accumulated.get(this.current) ?? 0) + Math.max(0, t - this.runningSince));
      this.runningSince = keepRunning && !this.hidden ? t : null;
    }
  }
}
