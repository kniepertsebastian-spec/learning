"use client";

import type { CatalogCert } from "@/components/admin/AdminCatalog";
import { ProgressBar } from "@/components/ui/progress";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";

/** Fortschritt eines laufenden Übersetzungslaufs: Balken mit Teilen und Prozent; vor dem Zählen ein schmaler Platzhalter. */
export function TranslationProgress({ cert }: { cert: CatalogCert }) {
  const ac = useLocale().t.admin_catalog;
  const { processed, total } = cert.translation;
  const pct = total > 0 ? (processed / total) * 100 : 0;
  return (
    <div className="mt-2 max-w-sm" data-testid={`translation-progress-${cert.slug}`}>
      <div className="mb-1 flex justify-between gap-2 text-xs text-subtle tabular-nums">
        <span>{total > 0 ? fmt(ac.translationParts, { n: processed, total }) : ac.translationPreparing}</span>
        {total > 0 && <span>{Math.round(pct)} %</span>}
      </div>
      <ProgressBar value={pct} size="sm" tone="info" label={fmt(ac.translationProgressFor, { name: cert.name })} />
    </div>
  );
}
