import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PathModuleView } from "@/lib/server/company/modules";

const STATE_LABEL = {
  valid: { de: "Gültig bis", en: "Valid until" },
  expiring: { de: "Läuft bald ab, gültig bis", en: "Expiring soon, valid until" },
  expired: { de: "Abgelaufen am", en: "Expired on" },
} as const;

function formatDate(iso: string, locale: "de" | "en") {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" });
}

/**
 * Firmenmodule auf der Lernpfad-Seite: Unterlagen der eigenen Firma zu diesem Lernpfad. Abgelaufene zeigen Lernenden
 * nur den Hinweis (Inhalt ist verborgen, bis die verantwortliche Person verlängert). Markdown ohne rohes HTML.
 */
export function CompanyModulesSection({ modules, companyName, locale }: { modules: PathModuleView[]; companyName: string; locale: "de" | "en" }) {
  const de = locale === "de";
  return (
    <section className="mb-6 rounded-xl border border-accent/40 bg-accent/5 p-5" data-testid="company-modules">
      <h2 className="font-semibold">{de ? `Von ${companyName}` : `From ${companyName}`}</h2>
      <p className="mt-1 text-xs text-foreground/70">
        {de ? "Unterlagen deiner Firma zu diesem Lernpfad." : "Your company's material for this learning path."}
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {modules.map((m) => (
          <li key={m.id} className="rounded-md border border-border bg-surface p-4" data-testid="company-module">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{m.title}</h3>
              <span className={`text-xs ${m.state === "valid" ? "text-foreground/60" : m.state === "expiring" ? "text-amber-600" : "text-red-500"}`} data-testid="company-module-state">
                {STATE_LABEL[m.state][locale]} {formatDate(m.validUntil, locale)}
                {m.responsible ? ` · ${de ? "Verantwortlich" : "Owner"}: ${m.responsible}` : ""}
              </span>
            </div>
            {m.body === null ? (
              <p className="mt-2 text-sm text-foreground/70" data-testid="company-module-expired">
                {de
                  ? "Diese Unterlage ist abgelaufen und wird von der verantwortlichen Person überarbeitet. Bitte frage dort nach."
                  : "This material has expired and is being revised by the person responsible. Please ask them."}
              </p>
            ) : (
              <div className="prose prose-sm mt-2 max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
