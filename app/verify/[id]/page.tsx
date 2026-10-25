export const dynamic = "force-dynamic";

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
      <h1 className="text-2xl font-semibold">{de ? "Nachweis prüfen" : "Verify a document"}</h1>
      {!result ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft p-4 text-sm text-danger-text" data-testid="verify-unknown">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {de ? "Zu dieser Kennung gibt es keinen Nachweis. Das Dokument ist nicht von uns ausgestellt worden." : "There is no document for this ID. It was not issued by us."}
        </p>
      ) : (
        <>
          <p className={`mt-4 flex items-start gap-2 rounded-xl border p-4 text-sm ${result.valid ? "border-mint-border bg-mint-soft text-mint-text" : "border-danger/40 bg-danger-soft text-danger-text"}`} data-testid="verify-status" data-valid={result.valid}>
            {result.valid ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            {result.valid
              ? de ? `Echt: Dieser Nachweis wurde am ${date(result.issuedAt)} ausgestellt und ist unverändert.` : `Genuine: this document was issued on ${date(result.issuedAt)} and is unchanged.`
              : result.revoked
                ? de ? "Widerrufen: Die Person hat diesen Nachweis zurückgezogen." : "Revoked: the holder has withdrawn this document."
                : de ? "Ungültig: Der gespeicherte Eintrag stimmt nicht mehr mit seiner Signatur überein." : "Invalid: the stored entry no longer matches its signature."}
          </p>
          {!result.revoked && (
            <div className="mt-6" data-testid="verify-content">
              <p className="text-sm text-subtle">{de ? "Ausgestellt für" : "Issued to"}</p>
              <p className="text-lg font-semibold" data-testid="verify-holder">{result.payload.holder}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {result.payload.courses.map((c) => (
                  <li key={`${c.course}-${c.earnedAt}`} className="rounded-xl border border-border bg-surface p-4 text-sm" data-testid="verify-course">
                    <p className="font-semibold">{c.course}</p>
                    <p>{c.certificate}{c.vendor ? ` (${c.vendor})` : ""}</p>
                    <p className="text-subtle">
                      {de ? "Erworben am" : "Earned on"} {date(c.earnedAt)} · {c.expiresAt ? `${de ? "gültig bis" : "valid until"} ${date(c.expiresAt)}` : de ? "unbegrenzt gültig" : "valid indefinitely"}
                    </p>
                    <p className="text-subtle">
                      {de ? `${c.chaptersCompleted} von ${c.chaptersTotal} Kapiteln abgeschlossen, ${c.lessonsDone} von ${c.lessonsTotal} Lektionen durchgearbeitet` : `${c.chaptersCompleted} of ${c.chaptersTotal} chapters completed, ${c.lessonsDone} of ${c.lessonsTotal} lessons worked through`}
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
