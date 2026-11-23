import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications, lessonReadingTime, sections, objectives, domains, studySessions, users } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

/** Stellt die Sichtbarkeit der Seite wie bei einem Tab-Wechsel um (siehe leave-flush.spec.ts). */
async function setVisibility(page: import("@playwright/test").Page, state: "hidden" | "visible") {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

/**
 * Sucht im Body nach Gerätedaten: Felder mit Namen wie Breite, Höhe oder User-Agent und Zahlen, die einer Viewport-Größe gleichen.
 * Zeit- und Zählfelder (…Ms, count) sind vom Zahlenvergleich ausgenommen, eine Antwortzeit von 800 ms ist keine Bildschirmhöhe.
 * Gibt die Fundstellen als Pfade zurück (leer heißt: nichts verraten).
 */
function deviceLeaks(value: unknown, sizes: readonly number[], path = "body", key = ""): string[] {
  const measured = /Ms$|^count$/i.test(key);
  if (typeof value === "number") return !measured && sizes.includes(value) ? [`${path} = ${value}`] : [];
  if (typeof value === "string") return !measured && /^\d+$/.test(value) && sizes.includes(Number(value)) ? [`${path} = "${value}"`] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => deviceLeaks(item, sizes, `${path}[${i}]`, key));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, item]) => [
      ...(/width|height|userAgent|screen|viewport|model/i.test(k) ? [`${path}.${k}`] : []),
      ...deviceLeaks(item, sizes, `${path}.${k}`, k),
    ]);
  }
  return [];
}

/**
 * Aufgabe 16, Faktor 4.12 (Review 12.11.2026): Die Größenklasse des Bildschirms (schmal oder breit, sonst nichts) wird beim Beenden
 * der Tages-Session mitgeschickt und an der Session gespeichert. Beendet wird über den Notausstieg, der dieselbe Abgabe benutzt.
 */
for (const [name, viewport, expected, user] of [
  ["Smartphone", { width: 390, height: 844 }, "narrow", USERS.deviceNarrow],
  ["großer Bildschirm", { width: 1280, height: 800 }, "wide", USERS.deviceWide],
] as const) {
  test(`Tages-Session am ${name}: Größenklasse „${expected}“ an der Session`, async ({ page, gateway }) => {
    await page.setViewportSize(viewport);
    await login(page, gateway.url, user.email);
    await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/session`);
    await page.getByText(/^(Right|Richtig)$/).first().click();
    await expect(page.getByTestId("feedback-panel")).toBeVisible();
    const request = page.waitForRequest((r) => /\/exit$/.test(r.url()));
    await page.getByTestId("exit-today").click();
    const body = (await request).postDataJSON() as Record<string, unknown>;
    // Nur die Klasse, keine Breite, kein Modell.
    expect(body.deviceClass).toBe(expected);
    // Gezielt prüfen statt im JSON-Text suchen: zufällige UUIDs im Body enthalten mitunter „390“ oder „1280“ (CI-Flake vom 22.11.2026).
    const leaks = deviceLeaks(body, [viewport.width, viewport.height]);
    expect(leaks).toEqual([]);

    const db = getDb();
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, user.email)).limit(1);
    await expect
      .poll(async () => (await db.select({ c: studySessions.deviceClass }).from(studySessions).where(and(eq(studySessions.userId, row.id), eq(studySessions.status, "completed"))))[0]?.c ?? null)
      .toBe(expected);
  });
}

/**
 * Aufgabe 16, Faktor 4.9: Die Lesezeit der Lektion zählt nur, solange die Seite sichtbar ist, und das Öffnen wird gezählt.
 */
test("Lesezeit je Lektion: Zeit im Hintergrund zählt nicht, das Öffnen schon", async ({ page, gateway }) => {
  const db = getDb();
  const [section] = await db
    .select({ id: sections.id })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(certifications, eq(certifications.id, domains.certificationId))
    .where(eq(certifications.slug, COURSE_SLUG))
    .limit(1);
  await login(page, gateway.url, USERS.learnerB.email);
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.learnerB.email)).limit(1);
  await db.delete(lessonReadingTime).where(and(eq(lessonReadingTime.userId, user.id), eq(lessonReadingTime.sectionId, section.id)));

  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/section/${section.id}`);
  await expect(page.getByTestId("lesson-page")).toBeVisible();
  // Gut sieben Sekunden lesen (ein Takt à 5 Sekunden), dann zwölf Sekunden im Hintergrund, dann zurück und melden.
  await page.mouse.move(100, 100);
  await page.waitForTimeout(7500);
  await setVisibility(page, "hidden");
  await page.waitForTimeout(12_000);
  await setVisibility(page, "visible");
  await setVisibility(page, "hidden");

  await expect
    .poll(async () => (await db.select().from(lessonReadingTime).where(and(eq(lessonReadingTime.userId, user.id), eq(lessonReadingTime.sectionId, section.id))))[0]?.seconds ?? 0, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(5);
  const [row] = await db.select().from(lessonReadingTime).where(and(eq(lessonReadingTime.userId, user.id), eq(lessonReadingTime.sectionId, section.id)));
  // Die zwölf Sekunden im Hintergrund hätten mindestens zehn dazugegeben.
  expect(row.seconds).toBeLessThan(15);
  expect(row.opens).toBe(1);
});
