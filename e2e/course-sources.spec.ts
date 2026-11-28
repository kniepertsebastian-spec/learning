import { notInArray } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { courseGenerationJobs } from "../lib/server/db/schema";
import { USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

// Quellen-Roadmap (28.11.2026): Datei-Upload im Kurs-Assistenten, Blueprint-Markierung (AP-2.1) und „Quellen prüfen“ mit
// Zeichenzahl, Kürzungswarnung und Budget-Anzeige (AP-3.3). Ohne Netz: nur hochgeladene Dateien, kein Abruf von Adressen.

const blueprint = [
  "# Prüfungsordnung E2E",
  ...Array.from({ length: 12 }, (_, i) => `${Math.floor(i / 4) + 1}.${(i % 4) + 1} Kompetenz Nummer ${i + 1} sicher anwenden`),
  "Fließtext zur Prüfung. ".repeat(40),
].join("\n");
const reference = ["# Fachbuch", "Erklärender Fachtext ohne Nummern. ".repeat(4_000)].join("\n");

test("Kurs-Assistent: Dateien hochladen, Blueprint markieren, Quellen prüfen", async ({ page, gateway }) => {
  // Der Assistent stellt den letzten nicht veröffentlichten, nicht abgebrochenen Auftrag wieder her (z. B. einen aus den
  // Datenbank-Tests derselben CI-Datenbank) und zeigt dann statt des Formulars dessen Stand.
  await getDb().update(courseGenerationJobs).set({ status: "cancelled" }).where(notInArray(courseGenerationJobs.status, ["published", "cancelled"]));
  await login(page, gateway.url, USERS.admin.email);
  await page.goto(`${gateway.url}/admin`);
  await page.getByTestId("open-wizard").click();
  const wizard = page.getByTestId("course-wizard");
  await wizard.locator('input[name="courseTitle"]').fill(`E2E Quellen ${Date.now()}`);
  await wizard.locator('textarea[name="courseDescription"], input[name="courseDescription"]').first().fill("Kurs aus hochgeladenen Quellen");
  await wizard.locator('input[name="provider"]').fill("E2E Kammer");
  await page.getByTestId("wizard-next").click();

  // Zwei Dateien: application/octet-stream wie bei manchen Browsern; maßgeblich sind Endung und Inhalt.
  await page.getByTestId("source-files-input").setInputFiles([
    { name: "fachbuch.md", mimeType: "application/octet-stream", buffer: Buffer.from(reference) },
    { name: "pruefungsordnung.md", mimeType: "text/markdown", buffer: Buffer.from(blueprint) },
  ]);
  const cards = page.getByTestId("source-urls-list").locator("li");
  await expect(cards).toHaveCount(2);

  // Prüfen ohne Markierung: der Leitfaden wird an den Lernziel-Nummern erkannt, das lange Fachbuch wird gekürzt.
  await page.getByTestId("check-sources").click();
  const budget = page.getByTestId("source-budget");
  await expect(budget).toContainText(/400[.,]000/);
  await expect(cards.filter({ hasText: "pruefungsordnung.md" })).toContainText(/Leitfaden \(erkannt\)|guide \(detected\)/);
  await expect(cards.filter({ hasText: "fachbuch.md" }).getByTestId("source-check-truncated")).toBeVisible();

  // Das Fachbuch als Blueprint markieren: die Prüfung ist veraltet, nach erneutem Prüfen wird es nicht mehr gekürzt.
  await cards.filter({ hasText: "fachbuch.md" }).getByTestId("source-mark-blueprint").click();
  await expect(cards.filter({ hasText: "fachbuch.md" })).toHaveAttribute("data-primary", "true");
  await expect(page.getByTestId("source-budget")).toHaveCount(0);
  await page.getByTestId("check-sources").click();
  await expect(page.getByTestId("source-budget")).toBeVisible();
  await expect(cards.filter({ hasText: "fachbuch.md" }).getByTestId("source-check-chars")).toBeVisible();
  await expect(cards.filter({ hasText: "fachbuch.md" }).getByTestId("source-mark-blueprint")).toHaveAttribute("aria-pressed", "true");

  // Markierung zurücknehmen und die Quelle entfernen: keine verwaiste Markierung.
  await cards.filter({ hasText: "fachbuch.md" }).getByTestId("source-mark-blueprint").click();
  await expect(cards.filter({ hasText: "fachbuch.md" })).not.toHaveAttribute("data-primary", "true");
});
