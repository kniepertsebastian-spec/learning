import { USERS } from "./global-setup";
import { expect, login, runtimeCachePaths, test, waitForServiceWorkerReady } from "./fixtures";

const allPaths = (caches: Record<string, string[]>) => Object.values(caches).flat();

test("Admin- und Firmenseiten landen in keinem Cache; Lernseiten im pages-cache", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.admin.email);
  await waitForServiceWorkerReady(page);
  for (const path of ["/admin", "/company", "/profile", "/"]) {
    await page.goto(`${gateway.url}${path}`);
    await page.waitForLoadState("load");
  }
  // Cache-Schreibzugriffe laufen im Service Worker asynchron
  await expect.poll(async () => (await runtimeCachePaths(page))["pages-cache"] ?? []).toContain("/profile");
  const caches = await runtimeCachePaths(page);
  expect(Object.keys(caches)).toEqual(expect.arrayContaining(["pages-cache"]));
  expect(Object.keys(caches)).not.toContain("ui-cache");
  const paths = allPaths(caches);
  expect(paths.some((p) => p === "/admin" || p.startsWith("/admin/") || p === "/company" || p.startsWith("/company/"))).toBe(false);
});

test("Nutzerwechsel ohne Logout und Logout leeren den Seiten-Cache", async ({ page, context, gateway }) => {
  const putSentinel = (name: string) =>
    page.evaluate(async (n) => {
      await (await caches.open("pages-cache")).put(`/${n}`, new Response("x"));
    }, name);

  await login(page, gateway.url, USERS.learnerA.email);
  await waitForServiceWorkerReady(page);
  await putSentinel("sentinel-a");
  expect((await runtimeCachePaths(page))["pages-cache"]).toContain("/sentinel-a");

  // Sitzung "läuft ab" (kein aktiver Logout), anderer Nutzer meldet sich an
  await context.clearCookies();
  await login(page, gateway.url, USERS.learnerB.email);
  await expect.poll(async () => (await runtimeCachePaths(page))["pages-cache"] ?? []).not.toContain("/sentinel-a");

  // Aktiver Logout
  await putSentinel("sentinel-b");
  await page.getByTestId("user-menu").click();
  await page.getByTestId("header-logout").click();
  await page.waitForURL(/\/login|\/$/);
  await expect.poll(async () => (await runtimeCachePaths(page))["pages-cache"] ?? []).not.toContain("/sentinel-b");
});
