import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Einstufungstest: direkt nach der Kurswahl, einmalig, Ergebnis je Kapitel, danach geht es in den Kurs", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.preAssessment.email);
  // Die Kurswahl führt zuerst in den Einstufungstest.
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await page.waitForURL(new RegExp(`/cert/${COURSE_SLUG}/pre-assessment`));
  await expect(page.getByTestId("pre-assessment-intro")).toBeVisible();

  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  // Der Demo-Kurs hat drei Auswahlfragen; jede beantworten (erste Option), die letzte wertet aus.
  for (let guard = 0; guard < 10; guard++) {
    await page.getByRole("radio").first().click();
    const submit = page.getByTestId("pre-assessment-submit");
    if (await submit.isVisible().catch(() => false)) {
      await submit.click();
      break;
    }
    await page.getByTestId("pre-assessment-next").click();
  }
  await expect(page.getByTestId("pre-assessment-result")).toBeVisible();
  await expect(page.getByTestId("pre-assessment-domains")).toBeVisible();
  expect(posts.filter((u) => /\/api\/pre-assessment\//.test(u))).toHaveLength(1);

  await page.getByTestId("pre-assessment-continue").click();
  await page.waitForURL(new RegExp(`/cert/${COURSE_SLUG}$`));
  await expect(page.getByTestId("pre-assessment-card")).toBeVisible();
  // Einmalig: weder der Kurs noch die Testseite schicken noch einmal hin.
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/pre-assessment`);
  await page.waitForURL(new RegExp(`/cert/${COURSE_SLUG}$`));
});

test("Einstufungstest überspringen: der Kurs öffnet, der Test kommt nicht wieder", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.preAssessmentSkip.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await page.waitForURL(new RegExp(`/cert/${COURSE_SLUG}/pre-assessment`));
  await page.getByTestId("pre-assessment-skip").click();
  await page.waitForURL(new RegExp(`/cert/${COURSE_SLUG}$`));
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await expect(page).toHaveURL(new RegExp(`/cert/${COURSE_SLUG}$`));
  await expect(page.getByTestId("pre-assessment-card")).toHaveCount(0);
});

test("Lektionen haben keine Vorab-Fragen mehr, „Sitzt das?“ gibt es erst am Kapitelende", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await page.getByRole("link", { name: /First lesson|Erste Lektion/ }).first().click();
  await page.waitForURL(/\/section\//);
  await expect(page.getByTestId("lesson-pretest")).toHaveCount(0);
  await expect(page.getByTestId("quiz-hero")).toHaveCount(0);
  await expect(page.getByTestId("lesson-complete-button")).toBeVisible();
  // Die einzige Lektion des Demo-Kurses ist zugleich die letzte des Kapitels: der Weg zum Kapitel-Quiz steht darunter.
  await page.getByTestId("start-chapter-quiz").click();
  await page.waitForURL(/\/chapter\/.+\/quiz/);
  await expect(page.getByTestId("focus-close")).toBeVisible();
});
