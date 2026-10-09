"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [error, formAction, isPending] = useActionState(loginAction, null);
  const params = useSearchParams();
  const from = safeRedirectPath(params.get("from"));
  const notice = params.get("passwordChanged")
    ? "Password changed. Please sign in again."
    : params.get("accountDeleted")
      ? "Your account has been deleted."
      : params.get("passwordReset")
        ? "Password reset. Please sign in with your new password."
        : params.get("verified")
          ? "Email confirmed. You can sign in now."
          : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="mb-6 text-xl font-semibold">Sign in</h1>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="from" value={from} />
          {notice && (
            <p role="status" className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600" data-testid="login-notice">
              {notice}
            </p>
          )}
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
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/sso" className="text-link hover:underline" data-testid="login-sso-link">
            Sign in with company account (SSO)
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-foreground/60">
          <Link href="/forgot-password" className="text-link hover:underline">
            Forgot password?
          </Link>
          {" · "}
          <Link href="/resend-verification" className="text-link hover:underline">
            Resend confirmation email
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-foreground/60">
          No account?{" "}
          <Link
            href={from === "/" ? "/register" : `/register?from=${encodeURIComponent(from)}`}
            className="text-link hover:underline"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
