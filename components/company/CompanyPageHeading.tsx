import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { Overline } from "@/components/ui/card";

export type AttentionItem = { label: string; href: string };

/**
 * Kopf eines Reiters im Firmenbereich: Firma und Rolle, Titel, kurze Beschreibung und – falls etwas Aufmerksamkeit
 * braucht – Links mit Zahl (überfällig, wartet auf Bestätigung, …). Ohne Hooks, damit Server- und Client-Seiten ihn nutzen.
 */
export function CompanyPageHeading({ overline, title, description, attention = [], attentionLabel }: { overline: string; title: string; description?: string; attention?: AttentionItem[]; attentionLabel: string }) {
  return (
    <div className="min-w-0">
      <Overline className="text-link" data-testid="company-role">{overline}</Overline>
      <h1 className="mt-1 text-2xl font-semibold tracking-title sm:text-title">{title}</h1>
      {description && <p className="mt-1.5 max-w-3xl text-sm text-subtle">{description}</p>}
      {attention.length > 0 && (
        <ul aria-label={attentionLabel} className="mt-3 flex flex-wrap gap-2" data-testid="company-attention">
          {attention.map((a) => (
            <li key={a.href + a.label}>
              <Link href={a.href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-3 text-meta font-medium text-warning-text hover:border-warning">
                <CircleAlert className="h-4 w-4" aria-hidden="true" />
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
