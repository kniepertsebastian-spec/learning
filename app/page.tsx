export const dynamic = "force-dynamic";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { logoutAction } from "@/app/actions/auth";

export default async function DashboardPage() {
  const db = getDb();
  const [session, certs] = await Promise.all([
    auth(),
    db.select().from(certifications).orderBy(certifications.name),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {session?.user
            ? `Welcome back, ${session.user.name ?? session.user.email}!`
            : "Certifications"}
        </h1>
        <div className="flex items-center gap-2">
          {session ? (
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface"
              >
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>

      {certs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <GraduationCap className="mb-4 h-12 w-12 text-foreground/40" aria-hidden="true" />
          <h2 className="mb-2 text-lg font-medium">No certifications available yet</h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certs.map((cert) => (
            <Link
              key={cert.id}
              href={`/cert/${cert.slug}`}
              className="group rounded-xl border border-border bg-surface p-5 hover:border-accent"
            >
              <h2 className="mb-1 font-semibold group-hover:text-accent">{cert.name}</h2>
              <p className="mb-4 text-sm text-foreground/60">
                {cert.examName} {cert.examVersion}
              </p>
              <span className="inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
                {session ? "Continue learning →" : "Start learning →"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
