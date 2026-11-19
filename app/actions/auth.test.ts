import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  endAllSessions: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ auth: mocks.auth, signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/server/account/sessions", () => ({ endAllSessions: mocks.endAllSessions }));

import { logoutAction } from "./auth";

describe("logoutAction (Aufgabe 20)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("beendet erst alle Sitzungen, dann wird das Cookie gelöscht", async () => {
    const order: string[] = [];
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    mocks.endAllSessions.mockImplementation(async () => { order.push("end"); });
    mocks.signOut.mockImplementation(async () => { order.push("signOut"); });

    await logoutAction();

    expect(mocks.endAllSessions).toHaveBeenCalledWith("u1");
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/" });
    expect(order).toEqual(["end", "signOut"]);
  });

  it("ohne Sitzung wird nur abgemeldet", async () => {
    mocks.auth.mockResolvedValue(null);
    await logoutAction();
    expect(mocks.endAllSessions).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
