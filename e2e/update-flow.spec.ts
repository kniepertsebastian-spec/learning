import { USERS } from "./global-setup";
import { expect, login, test, waitForServiceWorkerReady } from "./fixtures";

test("neuer Service Worker: Update-Hinweis, kein erzwungener Reload, Aktivierung erst nach Klick", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await waitForServiceWorkerReady(page);
  await page.evaluate(() => {
    (window as unknown as { __marker: string }).__marker = "alt";
  });

  // "Deploy": neuer Worker-Inhalt, Seite bleibt offen
  gateway.deploy(2);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(true);

  const toast = page.getByText(/New version available|Neue Version verfügbar/);
  await expect(toast.first()).toBeVisible();

  // Ohne Klick: kein Reload, alter Worker steuert weiter, der neue wartet
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe("alt");
  expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(true);

  // Klick → neuer Worker aktiv → Reload
  const reloaded = page.waitForEvent("load");
  await page.getByRole("button", { name: /^(Reload|Neu laden)$/ }).click();
  await reloaded;
  expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBeUndefined();
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.active) && !registration?.waiting;
  })).toBe(true);
});
