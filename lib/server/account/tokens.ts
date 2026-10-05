import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { accountTokens, type AccountTokenPurpose } from "@/lib/server/db/schema";

export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;

export const TOKEN_TTL_MS: Record<AccountTokenPurpose, number> = {
  verify_email: VERIFY_EMAIL_TTL_MS,
  reset_password: RESET_PASSWORD_TTL_MS,
};

export function hashAccountToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Legt ein Einmal-Token an und gibt es EINMALIG zurück (gespeichert wird nur der Hash).
 * Noch offene Tokens desselben Zwecks für diesen Nutzer werden ersetzt: pro Nutzer und Zweck
 * gilt immer nur der zuletzt verschickte Link.
 */
export async function createAccountToken(
  userId: string,
  purpose: AccountTokenPurpose,
  now: Date = new Date(),
  executor: Db | Tx = getDb(),
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await executor
    .delete(accountTokens)
    .where(
      and(
        eq(accountTokens.userId, userId),
        eq(accountTokens.purpose, purpose),
        isNull(accountTokens.usedAt),
      ),
    );
  await executor.insert(accountTokens).values({
    userId,
    purpose,
    tokenHash: hashAccountToken(token),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
  });
  return token;
}

/**
 * Verbraucht ein Token atomar (ein UPDATE mit Bedingungen): gültig = richtiger Zweck, nicht benutzt,
 * nicht abgelaufen. Gibt die Nutzer-ID zurück oder null. Bei parallelen Versuchen gewinnt genau einer.
 */
export async function consumeAccountToken(
  token: string,
  purpose: AccountTokenPurpose,
  now: Date = new Date(),
  executor: Db | Tx = getDb(),
): Promise<string | null> {
  const [row] = await executor
    .update(accountTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(accountTokens.tokenHash, hashAccountToken(token)),
        eq(accountTokens.purpose, purpose),
        isNull(accountTokens.usedAt),
        gt(accountTokens.expiresAt, now),
      ),
    )
    .returning({ userId: accountTokens.userId });
  return row?.userId ?? null;
}
