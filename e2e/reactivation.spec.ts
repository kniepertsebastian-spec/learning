import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { users } from "../lib/server/db/schema";
import { unsubscribeToken } from "../lib/server/reactivation/token";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Link aus der Reaktivierungs-Mail startet direkt eine kurze Runde", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerB.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/restart`);
  await page.waitForURL(`**/cert/${COURSE_SLUG}/session`);
  await expect(page.getByText(/Question \d\?|Frage \d\?|Variant\?|Variante\?/).first()).toBeVisible();
});

test("Abmeldelink: erst ein Klick meldet ab, ein falsches Token nicht", async ({ page, gateway }) => {
  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, USERS.learnerB.email)).limit(1);
  const secret = process.env.AUTH_SECRET ?? "e2e-only-secret";

  await page.goto(`${gateway.url}/unsubscribe/reactivation?u=${user.id}&t=falsch-falsch-falsch`);
  await expect(page.getByTestId("unsubscribe-button")).toHaveCount(0);

  await page.goto(`${gateway.url}/unsubscribe/reactivation?u=${user.id}&t=${unsubscribeToken(user.id, secret)}`);
  const [before] = await getDb().select({ o: users.reactivationOptOut }).from(users).where(eq(users.id, user.id));
  expect(before.o).toBe(false); // das bloße Aufrufen (Mail-Scanner) ändert nichts
  await page.getByTestId("unsubscribe-button").click();
  await expect(page.getByTestId("unsubscribed")).toBeVisible();
  const [after] = await getDb().select({ o: users.reactivationOptOut }).from(users).where(eq(users.id, user.id));
  expect(after.o).toBe(true);
  await getDb().update(users).set({ reactivationOptOut: false }).where(eq(users.id, user.id));
});
