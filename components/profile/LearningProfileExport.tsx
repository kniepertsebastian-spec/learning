"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/types";

export interface ExportCourse {
  course: string;
  certificate: string;
}
export interface IssuedExport {
  id: string;
  issuedAt: string;
  revokedAt: string | null;
}

/**
 * Lernprofil als verifizierter PDF-Nachweis (z. B. für Arbeitgeber): zeigt, welche Kurse hineinkommen (nur solche mit hinterlegter, bestandener
 * Zertifikatsprüfung), erstellt das PDF und listet die bisher ausgestellten, jederzeit widerrufbar.
 */
export function LearningProfileExport({ courses, issued, locale }: { courses: ExportCourse[]; issued: IssuedExport[]; locale: Locale }) {
  const router = useRouter();
  const de = locale === "de";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string) => new Date(iso).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/export", { method: "POST" });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `Status ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lernprofil.pdf";
      link.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : de ? "Das PDF konnte nicht erstellt werden." : "The PDF could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm(de ? "Dieses PDF widerrufen? Die Prüfseite zeigt es danach als widerrufen." : "Revoke this PDF? The verification page will then show it as revoked.")) return;
    const response = await fetch(`/api/profile/export/${id}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4" data-testid="profile-export">
      <h2 className="font-semibold">{de ? "Lernprofil als PDF-Nachweis" : "Learning profile as a PDF record"}</h2>
      <p className="mt-1 text-sm text-muted">
        {de
          ? "Ein standardisierter, fälschungssicherer Nachweis über deinen Kenntnisstand, z. B. für Arbeitgeber. Aufgeführt werden nur Kurse, zu denen eine erfolgreiche Zertifikatsprüfung hinterlegt ist. Jedes PDF trägt einen Prüfcode und lässt sich online prüfen."
          : "A standardised, tamper-proof record of your knowledge, e.g. for employers. Only courses with a recorded, passed certification exam are listed. Every PDF carries a verification code and can be checked online."}
      </p>
      {courses.length === 0 ? (
        <p className="mt-3 text-sm text-subtle" data-testid="profile-export-empty">
          {de ? "Noch keiner deiner Kurse hat eine hinterlegte, bestandene Zertifikatsprüfung. Trage sie unter „Meine Zertifikate“ ein und verknüpfe sie mit dem Kurs." : "None of your courses has a recorded, passed certification exam yet. Add it under “My certificates” and link it to the course."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1 text-sm" data-testid="profile-export-courses">
          {courses.map((c) => (
            <li key={c.course}>
              <span className="font-medium">{c.course}</span> <span className="text-subtle">· {c.certificate}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Button onClick={() => void create()} disabled={busy || courses.length === 0} iconLeft={busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />} data-testid="profile-export-create">
          {de ? "PDF erstellen" : "Create PDF"}
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger-text">{error}</p>}
      {issued.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 text-sm" data-testid="profile-export-issued">
          {issued.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{de ? "Ausgestellt am" : "Issued on"} {date(i.issuedAt)}</span>
              {i.revokedAt ? (
                <span className="text-subtle">{de ? "widerrufen" : "revoked"}</span>
              ) : (
                <>
                  <a href={`/verify/${i.id}`} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">{de ? "Prüfseite" : "Verification page"}</a>
                  <button type="button" onClick={() => void revoke(i.id)} className="text-link hover:underline" data-testid="profile-export-revoke">{de ? "Widerrufen" : "Revoke"}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
