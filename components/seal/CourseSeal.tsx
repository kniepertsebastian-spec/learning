import Link from "next/link";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { anonymousLabel, changeDetail, changeLabel, SEAL_DISCLAIMER, type Seal } from "@/lib/reviewers/seal";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/cn";

const dateOf = (iso: string, locale: Locale) => new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" });

/**
 * Siegel „Fachlich geprüft von …“. Ohne Hooks (Server- und Client-Komponenten können es einbinden). Namen sind Links auf das öffentliche Profil;
 * Prüfer ohne Profil erscheinen nur als „externer Experte“. Mit Änderungen seit der Prüfung steht das dabei, Details auf Klick.
 */
export function CourseSeal({ seal, locale, variant = "full", className }: { seal: Seal; locale: Locale; variant?: "full" | "compact"; className?: string }) {
  const de = locale === "de";
  const changed = seal.changeCount !== null && seal.changeCount > 0;
  const date = dateOf(seal.approvedAt, locale);

  if (variant === "compact") {
    return (
      <p className={cn("flex items-center gap-1.5 text-xs text-mint-text", className)} data-testid="course-seal" data-variant="compact">
        <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {de ? "Fachlich geprüft" : "Expert reviewed"} · {de ? "Version" : "Version"} {seal.versionLabel} · {de ? "Stand" : "as of"} {date}
        </span>
      </p>
    );
  }

  const names = seal.reviewers.map((r, i) => (
    <span key={r.slug}>
      {i > 0 ? ", " : ""}
      <Link href={`/experts/${r.slug}`} className="font-semibold text-link hover:underline" data-testid="seal-reviewer">{r.name}</Link>
    </span>
  ));
  return (
    <div className={cn("rounded-xl border border-mint-border bg-mint-soft p-3 text-sm", className)} data-testid="course-seal" data-variant="full" data-changed={changed}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-mint-text">
        <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span data-testid="seal-line">
          {de ? "Fachlich geprüft von" : "Reviewed by"}{" "}
          {names.length > 0 ? names : null}
          {names.length > 0 && seal.anonymousCount > 0 ? (de ? " und " : " and ") : null}
          {seal.anonymousCount > 0 || names.length === 0 ? anonymousLabel(Math.max(seal.anonymousCount, 1), locale) : null}
          {" · "}
          {de ? "Version" : "Version"} {seal.versionLabel} · {de ? "Stand" : "as of"} {date}
        </span>
      </p>
      {changed && seal.changeCount !== null && (
        <details className="mt-2 text-foreground" data-testid="seal-changes">
          <summary className="flex cursor-pointer items-center gap-1.5 text-warning-text">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {changeLabel(seal.changeCount, locale)}
          </summary>
          <p className="mt-1 text-xs text-subtle">
            {seal.changes ? `${changeDetail(seal.changes, locale)}. ` : ""}
            {de ? "Die Prüfung gilt für den oben genannten Stand; die Änderungen sind noch nicht erneut geprüft." : "The review applies to the date above; the changes have not been reviewed again yet."}
          </p>
        </details>
      )}
      <details className="mt-2 text-xs text-subtle">
        <summary className="cursor-pointer">{de ? "Was bedeutet „geprüft“?" : "What does “reviewed” mean?"}</summary>
        <p className="mt-1">{SEAL_DISCLAIMER[locale]}</p>
      </details>
    </div>
  );
}
