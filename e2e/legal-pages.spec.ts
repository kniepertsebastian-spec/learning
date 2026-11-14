import { expect, test } from "./fixtures";

/**
 * Aufgabe 07a (Review 12.11.2026): Datenschutz und Impressum sind ohne Anmeldung erreichbar und von Login und Registrierung
 * verlinkt. Ohne hinterlegte Betreiberangaben (der Test-Server hat keine) steht ein Hinweis statt erfundener Angaben, und die
 * Seiten sind für Suchmaschinen gesperrt.
 */
test("Datenschutz und Impressum sind ohne Anmeldung erreichbar", async ({ page, gateway }) => {
  for (const [path, testId] of [["/datenschutz", "datenschutz-page"], ["/impressum", "impressum-page"]] as const) {
    const response = await page.goto(`${gateway.url}${path}`);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(path);
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.getByTestId("operator-missing")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
});

for (const path of ["/login", "/register"]) {
  test(`${path} verlinkt Datenschutz, Impressum und AGB`, async ({ page, gateway }) => {
    await page.goto(`${gateway.url}${path}`);
    const links = page.getByTestId("legal-links");
    await expect(links.getByTestId("legal-link-privacy")).toHaveAttribute("href", "/datenschutz");
    await expect(links.getByTestId("legal-link-imprint")).toHaveAttribute("href", "/impressum");
    await expect(links.getByTestId("legal-link-terms")).toHaveAttribute("href", "/agb");
    await links.getByTestId("legal-link-privacy").click();
    await expect(page.getByTestId("datenschutz-page")).toBeVisible();
  });
}

test("Datenschutzerklärung nennt jede Angabe mit Zweck, Speicherdauer und Empfänger", async ({ page, gateway }) => {
  await page.goto(`${gateway.url}/datenschutz`);
  // Ohne Freigabe des Betreibers steht der Hinweis „Entwurf“ da.
  await expect(page.getByTestId("privacy-draft")).toBeVisible();
  const entries = page.getByTestId("privacy-entry");
  expect(await entries.count()).toBeGreaterThanOrEqual(10);
  for (const label of [/^(Angaben|Details)$/, /^(Zweck|Purpose)$/, /^(Speicherdauer|Retention)$/, /^(Empfänger|Recipients)$/]) await expect(entries.first().getByText(label)).toBeVisible();
  await expect(page.locator("#berufsprofil")).toContainText("Gemini");
  await expect(page.locator("#tagesangaben")).toContainText(/Zeitbudget|time budget/);
  await expect(page.locator("#altersspanne")).toBeVisible();
  // Aufgabe 10: Der KI-Dienst ist benannt, Verarbeitungsort und Trainingsausschluss kommen vom Betreiber (hier nicht gesetzt).
  await expect(page.locator("section[aria-labelledby=privacy-ai]")).toContainText("Gemini");
  await expect(page.getByTestId("ai-statement-missing")).toBeVisible();
});

/** Aufgabe 08 (Review 12.11.2026): Die AGB sind vollständig und enthalten keinen Platzhalter mehr. */
test("AGB nennen Parteien, Laufzeit, Kündigung und Haftung und enthalten keinen Platzhalter", async ({ page, gateway }) => {
  await page.goto(`${gateway.url}/agb`);
  const text = (await page.getByTestId("agb-page").innerText()).toLowerCase();
  expect(text).not.toMatch(/zu ergänzen|to be added|platzhalter|placeholder/);
  for (const id of ["parteien", "fachliche-pruefung", "keine-bestehensgarantie", "pruefungsbedingungen", "laufzeit-kuendigung", "haftung", "datenschutz"]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  // Betreiber und Kontakt stehen in den Parteien (ohne hinterlegte Angaben als Hinweis), die Freigabe steht aus.
  await expect(page.locator("#parteien").getByTestId("operator-notice")).toBeVisible();
  await expect(page.getByTestId("terms-draft")).toBeVisible();
  await expect(page.locator("#datenschutz a")).toHaveAttribute("href", "/datenschutz");
});
