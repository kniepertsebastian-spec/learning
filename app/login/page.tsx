"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
  const [error, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="mb-6 text-xl font-semibold">Sign in</h1>
        <form action={formAction} className="flex flex-col gap-4">
          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
              Invalid email or password.
            </p>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-foreground/60">
          No account?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
