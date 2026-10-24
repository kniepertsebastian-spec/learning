"use client";

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
    if (!res.ok) return setError(de ? "Das hat nicht geklappt." : "That did not work.");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3" data-testid="cert-verification">
      <h2 className="text-lg font-semibold">{de ? "Zertifikats-Nachweise der Prüfer" : "Reviewers' certification proofs"}</h2>
      <p className="text-xs text-subtle">{de ? "Öffne den Link, prüfe auf der Seite des Herstellers Name und Gültigkeit und markiere den Nachweis dann als geprüft. Erst danach steht auf dem öffentlichen Profil „Nachweis geprüft am …“." : "Open the link, check name and validity on the vendor's page, then mark the proof as checked. Only then the public profile says “Proof checked on …”."}</p>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {certs.length === 0 ? (
        <p className="text-sm text-subtle">{de ? "Noch keine Zertifikate eingetragen." : "No certifications entered yet."}</p>
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
                {c.verifiedAt ? <Badge tone="mint">{de ? "geprüft" : "checked"}</Badge> : <Badge tone="warning">{de ? "offen" : "open"}</Badge>}
                <Button size="sm" variant={c.verifiedAt ? "ghost" : "primary"} disabled={busy === c.id} onClick={() => void set(c.id, !c.verifiedAt)} data-testid="cert-verify-toggle">
                  {c.verifiedAt ? (de ? "Prüfung zurücknehmen" : "Undo check") : de ? "Als geprüft markieren" : "Mark as checked"}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
