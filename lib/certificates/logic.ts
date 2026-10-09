/** Reine Logik des Zertifikats-Registers (UI U9): Status, Ablauf-Monate, CSV. Keine Datenbank. */
export type CertStatus = "valid" | "expiring" | "expired";
export const EXPIRING_DAYS = 90;
export const VOUCHER_SOON_DAYS = 30;

export function certStatus(expiresAt: Date | null, now: Date): CertStatus {
  if (!expiresAt) return "valid";
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "expired";
  return days <= EXPIRING_DAYS ? "expiring" : "valid";
}

/** Gültig bis aus Erwerbsdatum und Gültigkeit in Monaten (null = unbegrenzt). */
export function expiryFrom(earnedAt: Date, validityMonths: number | null): Date | null {
  if (!validityMonths) return null;
  const d = new Date(Date.UTC(earnedAt.getUTCFullYear(), earnedAt.getUTCMonth() + validityMonths, earnedAt.getUTCDate()));
  return d;
}

/** Abläufe der nächsten `months` Monate (ab dem laufenden Monat), Anzahl je Monat. */
export function expiryByMonth(expiries: Array<Date | null>, now: Date, months = 12): Array<{ key: string; label: Date; count: number; soon: boolean }> {
  return Array.from({ length: months }, (_, i) => {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
    const count = expiries.filter((e) => e && e.getTime() >= from.getTime() && e.getTime() < to.getTime() && e.getTime() >= now.getTime()).length;
    return { key: from.toISOString().slice(0, 7), label: from, count, soon: i < 3 };
  });
}

/** CSV-Zelle: Anführungszeichen verdoppeln und Formel-Einleitungen (= + - @) entschärfen, damit Excel nichts ausführt. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Erinnerungen vor Ablauf: 90 und 30 Tage vorher (jeweils einmal). Liefert die fälligen Stufen. */
export function certReminderStages(expiresAt: Date | null, sent: Record<string, string>, now: Date): Array<"d90" | "d30"> {
  if (!expiresAt) return [];
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return [];
  const out: Array<"d90" | "d30"> = [];
  if (days <= 30 && !sent.d30) out.push("d30");
  else if (days <= 90 && !sent.d90 && !sent.d30) out.push("d90");
  return out;
}
