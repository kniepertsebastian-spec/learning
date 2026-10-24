import { describe, expect, it } from "vitest";
import { createReviewTiming, effectiveTime, MAX_EVENT_AGE_MS } from "./effective-time";

const now = new Date("2026-10-24T12:00:00Z");
const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe("effectiveTime", () => {
  it("übernimmt einen plausiblen Zeitpunkt aus der Vergangenheit", () => {
    const r = effectiveTime(iso(-7 * 86_400_000), {}, now);
    expect(r.at.toISOString()).toBe(iso(-7 * 86_400_000));
    expect(r).toMatchObject({ tooOld: false, adjusted: false });
  });
  it("setzt Zeitpunkte aus der Zukunft jenseits der Toleranz auf die Serverzeit", () => {
    const r = effectiveTime(iso(10 * 60_000), {}, now);
    expect(r.at).toEqual(now);
    expect(r.adjusted).toBe(true);
  });
  it("lässt kleine Uhrabweichung zu, begrenzt aber auf die Serverzeit", () => {
    expect(effectiveTime(iso(2 * 60_000), {}, now).at).toEqual(now);
  });
  it("hebt Zeitpunkte vor der Untergrenze auf die Untergrenze", () => {
    const floor = new Date(now.getTime() - 3 * 86_400_000);
    const r = effectiveTime(iso(-5 * 86_400_000), { notBefore: floor }, now);
    expect(r.at).toEqual(floor);
    expect(r.adjusted).toBe(true);
  });
  it("kennzeichnet Ereignisse älter als 30 Tage", () => {
    expect(effectiveTime(iso(-MAX_EVENT_AGE_MS - 1000), {}, now).tooOld).toBe(true);
    expect(effectiveTime(iso(-MAX_EVENT_AGE_MS + 1000), {}, now).tooOld).toBe(false);
  });
  it("fällt bei fehlender oder ungültiger Angabe auf die Serverzeit zurück", () => {
    expect(effectiveTime(undefined, {}, now).at).toEqual(now);
    expect(effectiveTime("kein Datum", {}, now).at).toEqual(now);
  });
});

describe("createReviewTiming", () => {
  it("nutzt den Zeitpunkt des Ereignisses, wenn die Antwort keinen eigenen hat", () => {
    const t = createReviewTiming({ eventTime: iso(-86_400_000), now });
    expect(t.forAnswer(undefined).at.toISOString()).toBe(iso(-86_400_000));
  });
  it("trennt Antworten einer langen Offline-Session zeitlich", () => {
    const t = createReviewTiming({ eventTime: iso(-3_600_000), now });
    expect(t.forAnswer(iso(-7_200_000)).at.toISOString()).toBe(iso(-7_200_000));
  });
  it("lässt keine Antwort nach dem Abschluss des Ereignisses liegen", () => {
    const t = createReviewTiming({ eventTime: iso(-3_600_000), now });
    expect(t.forAnswer(iso(-60_000)).at.toISOString()).toBe(iso(-3_600_000));
  });
});
