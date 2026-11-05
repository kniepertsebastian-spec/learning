import { USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/e2e-device-1";
const KEYS = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };

test("Web Push: ohne Anmeldung nichts, die Einstellungen fragen nie von selbst nach der Berechtigung", async ({ page, gateway }) => {
  // Jeder Aufruf von Notification.requestPermission() wird gezählt (sessionStorage überlebt die Seitenwechsel). Der Startwert
  // der Berechtigung hängt vom Browser ab (headless Chromium in der CI meldet „denied“, lokal „default“), darum prüfen wir
  // das Verhalten der Seite und nicht den Startwert.
  await page.addInitScript(() => {
    Notification.requestPermission = (() => {
      sessionStorage.setItem("permissionAsks", String(Number(sessionStorage.getItem("permissionAsks") ?? "0") + 1));
      return Promise.resolve(Notification.permission);
    }) as typeof Notification.requestPermission;
  });
  expect((await page.request.get(`${gateway.url}/api/push/preferences`)).status()).toBe(401);
  expect((await page.request.post(`${gateway.url}/api/push/subscribe`, { data: { endpoint: ENDPOINT, keys: KEYS } })).status()).toBe(401);

  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/account`);
  await expect(page.getByTestId("push-settings")).toBeVisible();
  await expect(page.getByTestId("push-toggle")).toBeVisible();
  await expect(page.getByTestId("push-state")).toContainText(/off for this device|aus/i);
  // Opt-in: die Seite hat die Berechtigung weder angefragt noch bekommen.
  expect(await page.evaluate(() => sessionStorage.getItem("permissionAsks"))).toBeNull();
  expect(await page.evaluate(() => Notification.permission)).not.toBe("granted");
});

test("Web Push: die drei Arten sind einzeln schaltbar und bleiben nach dem Neuladen erhalten", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/account`);
  const reviews = page.getByTestId("push-pref-reviewsDue");
  await expect(reviews).toBeChecked();
  await reviews.uncheck();
  await expect.poll(async () => (await (await page.request.get(`${gateway.url}/api/push/preferences`)).json()).prefs.reviewsDue).toBe(false);
  await page.reload();
  await expect(page.getByTestId("push-pref-reviewsDue")).not.toBeChecked();
  await expect(page.getByTestId("push-pref-examReminders")).toBeChecked();
  await page.getByTestId("push-pref-reviewsDue").check();
  await expect.poll(async () => (await (await page.request.get(`${gateway.url}/api/push/preferences`)).json()).prefs.reviewsDue).toBe(true);
});

test("Web Push: Abo anlegen und beenden; erfundene und interne Adressen werden abgelehnt", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerB.email);
  const devices = async () => (await (await page.request.get(`${gateway.url}/api/push/preferences`)).json()).devices as number;
  const before = await devices();

  for (const bad of ["http://fcm.googleapis.com/fcm/send/x", "https://localhost/push", "https://169.254.169.254/latest/meta-data", "https://fcm.googleapis.com.evil.example/x", "kein-link"]) {
    const response = await page.request.post(`${gateway.url}/api/push/subscribe`, { data: { endpoint: bad, keys: KEYS } });
    expect(response.status(), bad).toBe(400);
  }
  expect(await devices()).toBe(before);

  const ok = await page.request.post(`${gateway.url}/api/push/subscribe`, { data: { endpoint: ENDPOINT, keys: KEYS } });
  expect(ok.status()).toBe(201);
  expect(await devices()).toBe(before + 1);

  const removed = await page.request.delete(`${gateway.url}/api/push/subscribe`, { data: { endpoint: ENDPOINT } });
  expect(removed.ok()).toBe(true);
  expect(await devices()).toBe(before);
});
