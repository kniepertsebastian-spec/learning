export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { OperatorNotice } from "@/components/legal/OperatorNotice";
import { c_legalPages } from "@/lib/i18n/components/legalPages";
import { getOperatorInfo } from "@/lib/legal/operator";
import { PRIVACY_ENTRIES, PRIVACY_RIGHTS, PRIVACY_TECHNICAL } from "@/lib/legal/privacy";
import { getServerLocale } from "@/lib/server/locale";

/** Ohne vollständige Angaben des Betreibers bleibt die Seite für Suchmaschinen gesperrt. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Datenschutz / Privacy", robots: getOperatorInfo().complete ? undefined : { index: false, follow: false } };
}

/**
 * Datenschutzerklärung (Aufgabe 07a/07b, Review 12.11.2026): ohne Anmeldung erreichbar. Wer verantwortlich ist, steht in der
 * Umgebung des Servers (lib/legal/operator.ts).
 */
export default async function DatenschutzPage() {
  const de = (await getServerLocale()) === "de";
  const t = c_legalPages(de);
  const operator = getOperatorInfo();
  return (
    <div className="mx-auto w-full max-w-3xl py-6" data-testid="datenschutz-page">
      <h1 className="text-2xl font-semibold">{t.privacyTitle}</h1>
      {!operator.privacyReviewed && (
        <p role="note" className="mt-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-text" data-testid="privacy-draft">
          {t.privacyDraft}
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-text-2">
        {t.privacyIntro}
      </p>
      <section className="mt-6" aria-labelledby="privacy-controller">
        <h2 id="privacy-controller" className="mb-2 text-lg font-semibold">{t.controller}</h2>
        <OperatorNotice operator={operator} de={de} />
      </section>
      <section className="mt-8" aria-labelledby="privacy-data">
        <h2 id="privacy-data" className="mb-3 text-lg font-semibold">{t.whichDetails}</h2>
        <div className="flex flex-col gap-5">
          {PRIVACY_ENTRIES.map((entry) => {
            const l = de ? "de" : "en";
            return (
              <article key={entry.id} id={entry.id} className="rounded-lg border border-border bg-surface p-4" data-testid="privacy-entry">
                <h3 className="font-semibold">{entry.title[l]}</h3>
                <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm leading-relaxed sm:grid-cols-[9rem_1fr]">
                  <dt className="font-medium text-subtle">{t.details}</dt>
                  <dd className="text-text-2">{entry.data[l]}</dd>
                  <dt className="font-medium text-subtle">{t.purpose}</dt>
                  <dd className="text-text-2">{entry.purpose[l]}</dd>
                  <dt className="font-medium text-subtle">{t.retention}</dt>
                  <dd className="text-text-2">{entry.retention[l]}</dd>
                  <dt className="font-medium text-subtle">{t.recipients}</dt>
                  <dd className="text-text-2">{entry.recipients[l]}</dd>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
      <section className="mt-8" aria-labelledby="privacy-ai">
        <h2 id="privacy-ai" className="mb-2 text-lg font-semibold">{t.aiService}</h2>
        <p className="text-sm leading-relaxed text-text-2">
          {t.aiIntro}
        </p>
        {operator.aiStatement ? (
          <p className="mt-2 text-sm leading-relaxed text-text-2" data-testid="ai-statement">{operator.aiStatement}</p>
        ) : (
          <p role="note" className="mt-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-text" data-testid="ai-statement-missing">
            {t.aiStatementMissing}
          </p>
        )}
      </section>
      <section className="mt-8" aria-labelledby="privacy-technical">
        <h2 id="privacy-technical" className="mb-3 text-lg font-semibold">{t.technical}</h2>
        <div className="flex flex-col gap-4 text-sm leading-relaxed text-text-2">
          {PRIVACY_TECHNICAL.map((item) => (
            <div key={item.title.de}>
              <h3 className="font-semibold text-foreground">{item.title[de ? "de" : "en"]}</h3>
              <p className="mt-1">{item.text[de ? "de" : "en"]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-8" aria-labelledby="privacy-rights">
        <h2 id="privacy-rights" className="mb-2 text-lg font-semibold">{t.yourRights}</h2>
        <p className="text-sm leading-relaxed text-text-2">{PRIVACY_RIGHTS[de ? "de" : "en"]}</p>
      </section>
    </div>
  );
}
