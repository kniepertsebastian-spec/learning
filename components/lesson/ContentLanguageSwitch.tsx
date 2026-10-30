"use client";

import { c_lessonContentLanguageSwitch } from "@/lib/i18n/components/lessonContentLanguageSwitch";
import { Languages } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { useSwitchLocale } from "@/lib/client/use-switch-locale";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/types";

const LOCALES: Locale[] = ["de", "en"];

/**
 * Sprachwahl oben in der Lektion: Deutsch oder Englisch. Schaltet die Sprache der App um (Inhalte und Oberfläche
 * gemeinsam, wie der Schalter im Benutzermenü). `available` sind die Sprachen, in denen die Lektion wirklich vorliegt;
 * fehlt die gewählte (Kurs noch nicht übersetzt), erklärt ein Hinweis, warum das Original zu sehen ist.
 */
export function ContentLanguageSwitch({ available, translationPending = false }: { available: Locale[]; translationPending?: boolean }) {
  const { locale, t } = useLocale();
  const switchLocale = useSwitchLocale();
  const lp = t.lesson_page;
  const missing = available.length > 0 && !available.includes(locale);
  const onlyIn = available.length === 1 ? (available[0] === "de" ? lp.onlyInDe : lp.onlyInEn) : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div role="group" aria-label={lp.contentLanguage} className="flex items-center gap-1 rounded-md border border-border-strong bg-control p-0.5" data-testid="content-language">
        <Languages className="mx-1.5 h-4 w-4 text-subtle" aria-hidden="true" />
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => l !== locale && switchLocale(l)}
            aria-pressed={l === locale}
            lang={l}
            data-testid={`content-language-${l}`}
            className={cn(
              "min-h-8 rounded px-2.5 text-meta font-semibold",
              l === locale ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {c_lessonContentLanguageSwitch(l).english}
          </button>
        ))}
      </div>
      {missing && (
        <p className="max-w-xs text-right text-xs text-subtle" role="status" data-testid="content-language-hint">
          {translationPending ? lp.translationPending : onlyIn}
        </p>
      )}
    </div>
  );
}
