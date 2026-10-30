"use client";

import { c_adminReviewerCertVerification } from "@/lib/i18n/components/adminReviewerCertVerification";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type CertRow = { id: string; reviewerName: string; vendor: string; name: string; earnedOn: string; validUntil: string | null; verificationUrl: string; verifiedAt: string | null };

/** Betreiber: Nachweis-Links der Prüfer-Zertifikate öffnen, auf der Seite des Herstellers prüfen und als geprüft markieren (oder zurücknehmen). */
export function ReviewerCertVerification({ certs, locale }: { certs: CertRow[]; locale: "de" | "en" }) {
  const de = locale === "de";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function set(id: string, verified: boolean) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/reviewers/certifications/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified }) });
    setBusy(null);
    if (!res.ok) return setError(c_adminReviewerCertVerification(de).thatDidNotWork);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3" data-testid="cert-verification">
      <h2 className="text-lg font-semibold">{c_adminReviewerCertVerification(de).reviewersCertificationProofs}</h2>
      <p className="text-xs text-subtle">{c_adminReviewerCertVerification(de).openTheLinkCheckName}</p>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {certs.length === 0 ? (
        <p className="text-sm text-subtle">{c_adminReviewerCertVerification(de).noCertificationsEnteredYet}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {certs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm" data-testid="cert-verify-row">
              <span className="min-w-0">
                <span className="font-medium">{c.name}</span> <span className="text-subtle">· {c.vendor} · {c.reviewerName}</span>
                <span className="block text-xs text-subtle">
                  {c.earnedOn}
                  {c.validUntil ? ` → ${c.validUntil}` : ""}
                </span>
                <a href={c.verificationUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-link hover:underline break-all">
                  {c.verificationUrl} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </a>
              </span>
              <span className="flex items-center gap-2">
                {c.verifiedAt ? <Badge tone="mint">{c_adminReviewerCertVerification(de).checked}</Badge> : <Badge tone="warning">{c_adminReviewerCertVerification(de).open}</Badge>}
                <Button size="sm" variant={c.verifiedAt ? "ghost" : "primary"} disabled={busy === c.id} onClick={() => void set(c.id, !c.verifiedAt)} data-testid="cert-verify-toggle">
                  {c.verifiedAt ? (c_adminReviewerCertVerification(de).undoCheck) : c_adminReviewerCertVerification(de).markAsChecked}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
