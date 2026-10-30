"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Impact = { learners: number; companyAssignments: number; companyEntitlements: number; mandatoryRules: number };

/**
 * Betreiber: Kurs löschen. Zeigt zuerst, was daran hängt; gelöscht wird erst nach Eingabe des Kurznamens (Slug)
 * und, wenn Lerndaten oder Firmenzuweisungen dranhängen, einer zweiten ausdrücklichen Bestätigung.
 */
export function DeleteCertification({ certificationId, slug, name, locale }: { certificationId: string; slug: string; name: string; locale: "de" | "en" }) {
  const de = locale === "de";
  const router = useRouter();
  const [impact, setImpact] = useState<Impact | null>(null);
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const withData = impact ? impact.learners + impact.companyAssignments + impact.companyEntitlements + impact.mandatoryRules > 0 : false;

  async function open() {
    setError(null);
    const res = await fetch(`/api/admin/certifications/${certificationId}`, { cache: "no-store" });
    if (!res.ok) return setError(de ? "Konnte nicht geladen werden." : "Could not load.");
    setImpact((await res.json()).impact);
  }
  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/certifications/${certificationId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmSlug: typed.trim(), acknowledgeData: ack }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return setError(data?.error ?? (de ? "Löschen fehlgeschlagen." : "Delete failed."));
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-red-500/30 p-4" data-testid="delete-certification">
      <h2 className="font-medium text-red-600">{de ? "Kurs löschen" : "Delete course"}</h2>
      {!impact ? (
        <>
          <p className="mt-1 text-sm text-muted">
            {de ? "Entfernt den Kurs mit allen Lernzielen, Lektionen, Fragen und Quellen, z. B. ein doppelt angelegter Kurs." : "Removes the course with all objectives, lessons, questions and sources, e.g. a duplicate."}
          </p>
          <button type="button" onClick={() => void open()} data-testid="delete-open" className="mt-3 rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10">
            {de ? "Löschen …" : "Delete …"}
          </button>
        </>
      ) : (
        <div className="mt-2 flex flex-col gap-3 text-sm">
          {withData ? (
            <ul className="list-disc pl-5 text-red-600" data-testid="delete-impact">
              {impact.learners > 0 && <li>{de ? `${impact.learners} Person(en) mit Lernstand (geht verloren)` : `${impact.learners} learner(s) with progress (lost)`}</li>}
              {impact.companyAssignments > 0 && <li>{de ? `${impact.companyAssignments} Firmenzuweisung(en)` : `${impact.companyAssignments} company assignment(s)`}</li>}
              {impact.companyEntitlements > 0 && <li>{de ? `${impact.companyEntitlements} Firmenfreischaltung(en)` : `${impact.companyEntitlements} company release(s)`}</li>}
              {impact.mandatoryRules > 0 && <li>{de ? `${impact.mandatoryRules} Pflichtregel(n)` : `${impact.mandatoryRules} mandatory rule(s)`}</li>}
            </ul>
          ) : (
            <p className="text-muted" data-testid="delete-impact">{de ? "Am Kurs hängen keine Lerndaten oder Zuweisungen." : "No learner data or assignments are attached."}</p>
          )}
          {withData && (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="delete-ack" />
              {de ? "Ich weiß, dass diese Daten unwiderruflich gelöscht werden." : "I understand this data will be deleted permanently."}
            </label>
          )}
          <label className="flex flex-col gap-1">
            {de ? <>Zur Bestätigung den Kurznamen <code>{slug}</code> eintippen ({name})</> : <>Type the short name <code>{slug}</code> to confirm ({name})</>}
            <input value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="delete-confirm" className="rounded-md border border-border bg-background px-3 py-2" />
          </label>
          {error && <p role="alert" className="text-red-600" data-testid="delete-error">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || typed.trim() !== slug || (withData && !ack)} onClick={() => void remove()} data-testid="delete-submit" className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white disabled:opacity-50">
              {de ? "Endgültig löschen" : "Delete permanently"}
            </button>
            <button type="button" onClick={() => { setImpact(null); setTyped(""); setAck(false); }} className="rounded-md border border-border px-3 py-1.5">{de ? "Abbrechen" : "Cancel"}</button>
          </div>
        </div>
      )}
      {!impact && error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
