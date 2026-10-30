export const dynamic = "force-dynamic";

import { c_verifyIdPage } from "@/lib/i18n/components/verifyIdPage";
import { fill } from "@/lib/i18n/fill";
import type { Metadata } from "next";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { getServerLocale } from "@/lib/server/locale";
import { verifyIssuedProfile } from "@/lib/server/profile-export/service";

export const metadata: Metadata = { title: "Nachweis prüfen", robots: { index: false, follow: false } };

/**
 * Öffentliche Prüfseite für ein Lernprofil-PDF: zeigt, was zu dieser Kennung ausgestellt wurde. Wer das PDF in der Hand hat, vergleicht Name,
 * Kurse und Prüfcode. Die Kennung ist nicht erratbar; widerrufene oder veränderte Einträge gelten als ungültig.
 */
export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getServerLocale();
  const de = locale === "de";
  const result = z.string().uuid().safeParse(id).success ? await verifyIssuedProfile(id) : null;
  const date = (d: Date | string) => new Date(d).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });
  return (
    <div className="mx-auto w-full max-w-2xl py-8" data-testid="verify-page">
      <h1 className="text-2xl font-semibold">{c_verifyIdPage(de).verifyADocument}</h1>
      {!result ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft p-4 text-sm text-danger-text" data-testid="verify-unknown">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {c_verifyIdPage(de).thereIsNoDocumentFor}
        </p>
      ) : (
        <>
          <p className={`mt-4 flex items-start gap-2 rounded-xl border p-4 text-sm ${result.valid ? "border-mint-border bg-mint-soft text-mint-text" : "border-danger/40 bg-danger-soft text-danger-text"}`} data-testid="verify-status" data-valid={result.valid}>
            {result.valid ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            {result.valid
              ? fill(c_verifyIdPage(de).genuineThisDocumentWasIssued, date(result.issuedAt))
              : result.revoked
                ? c_verifyIdPage(de).revokedTheHolderHasWithdrawn
                : c_verifyIdPage(de).invalidTheStoredEntryNo}
          </p>
          {!result.revoked && (
            <div className="mt-6" data-testid="verify-content">
              <p className="text-sm text-subtle">{c_verifyIdPage(de).issuedTo}</p>
              <p className="text-lg font-semibold" data-testid="verify-holder">{result.payload.holder}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {result.payload.courses.map((c) => (
                  <li key={`${c.course}-${c.earnedAt}`} className="rounded-2xl border border-border bg-surface p-5 text-sm" data-testid="verify-course">
                    <p className="font-semibold">{c.course}</p>
                    <p>{c.certificate}{c.vendor ? ` (${c.vendor})` : ""}</p>
                    <p className="text-subtle">
                      {c_verifyIdPage(de).earnedOn} {date(c.earnedAt)} · {c.expiresAt ? `${c_verifyIdPage(de).validUntil} ${date(c.expiresAt)}` : c_verifyIdPage(de).validIndefinitely}
                    </p>
                    <p className="text-subtle">
                      {fill(c_verifyIdPage(de).n0Of1ChaptersCompleted, c.chaptersCompleted, c.chaptersTotal, c.lessonsDone, c.lessonsTotal)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
