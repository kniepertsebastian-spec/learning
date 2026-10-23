import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Vorabfragen: zwei Fragen vor dem Lektionstext, ohne Wertung; Überspringen zeigt den Text sofort", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);

  const openLesson = async () => {
    await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
    await page.getByRole("link", { name: /First lesson|Erste Lektion/ }).first().click();
    await page.waitForURL(/\/section\//);
  };
  const lessonText = page.getByText(/This is the lesson text|Dies ist der Lektionstext/);

  // Beantworten: Text erscheint erst nach beiden Vorabfragen
  await openLesson();
  await expect(page.getByTestId("lesson-pretest")).toBeVisible();
  await expect(lessonText).toHaveCount(0);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") requests.push(request.url());
  });
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("lesson-pretest").getByRole("radio").first().click();
    await expect(page.getByText(/Noted|Notiert/)).toBeVisible();
    await page.getByTestId("pretest-next").click();
  }
  await expect(page.getByTestId("lesson-pretest")).toHaveCount(0);
  await expect(lessonText).toBeVisible();
  // Keine Wertung: nichts wurde an den Server geschickt
  expect(requests.filter((url) => /attempt|session|review|answer/.test(url))).toEqual([]);

  // Überspringen
  await openLesson();
  await page.getByTestId("pretest-skip").click();
  await expect(lessonText).toBeVisible();
  await expect(page.getByTestId("lesson-pretest")).toHaveCount(0);
});
