import { describe, expect, it } from "vitest";
import {
  activeWeekdays,
  DEFAULT_REMINDER_HOUR,
  examPayload,
  inReminderWindow,
  localParts,
  pickReminderHour,
  previousDayKey,
  reviewsDuePayload,
  streakAtRisk,
  streakRiskPayload,
} from "./logic";

describe("Web Push: Regeln", () => {
  it("localParts: Datum, Stunde und ISO-Wochentag in der Zeitzone der Person", () => {
    // 2026-11-05 (Donnerstag) 23:30 UTC ist in Berlin schon Freitag 00:30 (MEZ), in New York noch Donnerstag 18:30.
    const at = new Date("2026-11-05T23:30:00Z");
    expect(localParts(at, "Europe/Berlin")).toEqual({ dateKey: "2026-11-06", hour: 0, weekday: 5 });
    expect(localParts(at, "America/New_York")).toEqual({ dateKey: "2026-11-05", hour: 18, weekday: 4 });
    expect(localParts(at, "Kein/Ort")).toEqual({ dateKey: "2026-11-06", hour: 0, weekday: 5 }); // ungültig: Berlin
  });

  it("pickReminderHour: Median der Lernstunden, im Fenster 8 bis 21, ohne Daten der Standard", () => {
    expect(pickReminderHour({})).toBe(DEFAULT_REMINDER_HOUR);
    expect(pickReminderHour({ 7: 2, 8: 1 })).toBe(DEFAULT_REMINDER_HOUR); // zu wenige
    expect(pickReminderHour({ 7: 3, 9: 3, 12: 1 })).toBe(9); // gewichteter Median: nach 3 von 7 noch nicht erreicht, nach 6 von 7 ja
  });

  it("pickReminderHour: nachts Lernende bekommen keine Nachtnachricht", () => {
    expect(pickReminderHour({ 2: 6, 3: 2 })).toBe(8);
    expect(pickReminderHour({ 23: 10 })).toBe(21);
    expect(pickReminderHour({ 19: 4, 20: 4, 21: 1 })).toBe(20);
  });

  it("inReminderWindow: ab der üblichen Stunde, höchstens drei Stunden und nie nach 21 Uhr", () => {
    expect(inReminderWindow(17, 18)).toBe(false);
    expect(inReminderWindow(18, 18)).toBe(true);
    expect(inReminderWindow(20, 18)).toBe(true);
    expect(inReminderWindow(21, 18)).toBe(false);
    expect(inReminderWindow(21, 21)).toBe(true);
    expect(inReminderWindow(22, 21)).toBe(false);
  });

  it("activeWeekdays: Wochentage mit mindestens zwei Lerntagen, bei wenig Daten jeder Tag", () => {
    expect([...activeWeekdays({ 1: 2, 3: 1 })].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([...activeWeekdays({ 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 })].sort()).toEqual([1, 2, 3]);
    expect(activeWeekdays({ 6: 1, 7: 1, 1: 6, 3: 4 }).has(6)).toBe(false);
  });

  it("previousDayKey rechnet über Monats- und Jahresgrenzen", () => {
    expect(previousDayKey("2026-03-01")).toBe("2026-02-28");
    expect(previousDayKey("2027-01-01")).toBe("2026-12-31");
    expect(previousDayKey("2028-03-01")).toBe("2028-02-29");
  });

  it("streakAtRisk: Serie bis gestern, heute noch nicht gelernt, mindestens drei Tage", () => {
    const days = new Set(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(streakAtRisk(days, "2026-11-05")).toBe(3);
    expect(streakAtRisk(new Set([...days, "2026-11-05"]), "2026-11-05")).toBe(0); // heute schon gelernt
    expect(streakAtRisk(new Set(["2026-11-03", "2026-11-04"]), "2026-11-05")).toBe(0); // zu kurz
    expect(streakAtRisk(new Set(["2026-11-01", "2026-11-03", "2026-11-04"]), "2026-11-05")).toBe(0); // Lücke
  });

  it("Texte: Sprache, Zahlen, Ziel und Tag", () => {
    expect(examPayload("exam_soon", { courseName: "AZ-900", daysUntil: 5 }, "de")).toMatchObject({ title: "Deine Prüfung rückt näher", body: "AZ-900: in 5 Tagen. Ein letzter Check lohnt sich.", url: "/exams", tag: "exam" });
    expect(examPayload("exam_soon", { courseName: "AZ-900", daysUntil: 1 }, "en").body).toBe("AZ-900: today or tomorrow. Good luck!");
    expect(examPayload("voucher_expiring", { courseName: "CKA", daysUntil: 12 }, "en").body).toBe("CKA: the voucher expires in 12 days.");
    expect(examPayload("retake_included", { courseName: "CKA", daysUntil: 0 }, "de").tag).toBe("retake");
    expect(reviewsDuePayload(14, "de").body).toBe("14 Fragen sind jetzt fällig. Ein paar Minuten reichen.");
    expect(streakRiskPayload(7, "en")).toMatchObject({ url: "/", tag: "daily" });
    // Beide Tagesarten teilen den Tag, damit sich Wiederholung und Serie nicht stapeln.
    expect(reviewsDuePayload(3, "de").tag).toBe(streakRiskPayload(3, "de").tag);
  });
});
