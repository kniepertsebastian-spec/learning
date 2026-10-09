"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeRedirectPath } from "@/lib/safe-redirect";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Von der Einladungsseite: Rückkehr nach dem Login und vorausgefüllte E-Mail.
  const from = safeRedirectPath(params.get("from"));
  const invitedEmail = params.get("email") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<"private" | "company">("private");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        accountType,
        companyName: accountType === "company" ? fd.get("companyName") : undefined,
      }),
    });
    setIsPending(false);
    if (res.ok) {
      const created = await res.json().catch(() => null);
      if (created?.verificationRequired) {
        setSentTo(String(fd.get("email")));
        return;
      }
      router.push(from === "/" ? "/login" : `/login?from=${encodeURIComponent(from)}`);
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Registration failed.");
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8" data-testid="check-inbox">
          <h1 className="mb-4 text-xl font-semibold">Check your inbox</h1>
          <p className="text-sm text-foreground/70">
            We sent a confirmation link to <strong>{sentTo}</strong>.{" "}
            {accountType === "company"
              ? "Confirm it to create your company and verify your address, then sign in."
              : "Confirm your email address, then sign in."}
          </p>
          <p className="mt-4 text-center text-sm text-foreground/60">
            <Link
              href={from === "/" ? "/login" : `/login?from=${encodeURIComponent(from)}`}
              className="text-link hover:underline"
            >
              Go to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="mb-6 text-xl font-semibold">Create account</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">I am registering as</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="accountType"
                checked={accountType === "private"}
                onChange={() => setAccountType("private")}
              />
              Private person
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="accountType"
                data-testid="account-type-company"
                checked={accountType === "company"}
                onChange={() => setAccountType("company")}
              />
              Company (I manage learning for my team)
            </label>
          </fieldset>
          {accountType === "company" && (
            <div>
              <label htmlFor="companyName" className="mb-1 block text-sm font-medium">
                Company name
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                required
                maxLength={120}
                autoComplete="organization"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-foreground/60">
                Use your company email address below. We send a confirmation link to it; the company is created once you confirm.
              </p>
            </div>
          )}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              {accountType === "company" ? "Company email" : "Email"}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={invitedEmail}
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
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-foreground/60">
          Already have an account?{" "}
          <Link
            href={from === "/" ? "/login" : `/login?from=${encodeURIComponent(from)}`}
            className="text-link hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
