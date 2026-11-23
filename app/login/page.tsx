"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { loginAction } from "@/app/actions/auth";
import { useLocale } from "@/lib/i18n";
import { c_loginPage } from "@/lib/i18n/components/loginPage";

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
  const { locale } = useLocale();
  const tx = c_loginPage(locale);
  const notice = params.get("passwordChanged")
    ? tx.passwordChanged
    : params.get("accountDeleted")
      ? tx.accountDeleted
      : params.get("passwordReset")
        ? tx.passwordReset
        : params.get("verified")
          ? tx.emailVerified
          : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold">Knowvia</p>
          <p className="text-xs text-subtle">{tx.tagline}</p>
        </div>
        <h1 className="mb-6 text-xl font-semibold">{tx.signIn}</h1>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="from" value={from} />
          {notice && (
            <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-text" data-testid="login-notice">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text" data-testid="login-error">
              {tx.invalidCredentials}
            </p>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              {tx.email}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              {tx.password}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="min-h-11 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? tx.signingIn : tx.signIn}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/sso" className="text-link hover:underline" data-testid="login-sso-link">
            {tx.signInWithSso}
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-subtle">
          <Link href="/forgot-password" className="text-link hover:underline">
            {tx.forgotPassword}
          </Link>
          {" · "}
          <Link href="/resend-verification" className="text-link hover:underline">
            {tx.resendConfirmation}
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-subtle">
          {tx.noAccount}{" "}
          <Link
            href={from === "/" ? "/register" : `/register?from=${encodeURIComponent(from)}`}
            className="text-link hover:underline"
          >
            {tx.register}
          </Link>
        </p>
      </div>
    </div>
  );
}
