import { BookMarked } from "lucide-react";
import type { CourseSourceEntry } from "@/lib/server/sources/course-sources";
import type { Locale } from "@/lib/types";

/**
 * „Quellen & Fachliteratur“ am Ende eines Kurses: einklappbar, für Lernende und Prüfer gleich. Ohne Server-/Client-Hooks.
 * Ohne Quellen entfällt der Bereich ganz.
 */
export function CourseSources({ sources, locale }: { sources: CourseSourceEntry[]; locale: Locale }) {
  if (sources.length === 0) return null;
  const de = locale === "de";
  const date = (iso: string) => new Date(iso).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });
  return (
    <details className="mt-10 rounded-2xl border border-border bg-surface p-4" data-testid="course-sources">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <BookMarked className="h-4 w-4 text-link" aria-hidden="true" />
        {de ? "Quellen & Fachliteratur" : "Sources & further reading"}
        <span className="font-normal text-subtle">({sources.length})</span>
      </summary>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {sources.map((s) => (
          <li key={`${s.url ?? s.title}`} data-testid="course-source">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-link hover:underline break-words">{s.title}</a>
            ) : (
              <span className="font-medium break-words">{s.title}</span>
            )}
            <span className="text-subtle">
              {[s.provider, s.version ? `${de ? "Version" : "Version"} ${s.version}` : null, s.publishedAt ? date(s.publishedAt) : null].filter(Boolean).map((part) => ` · ${part}`).join("")}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
