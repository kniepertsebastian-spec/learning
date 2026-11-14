export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { OperatorNotice } from "@/components/legal/OperatorNotice";
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
  const operator = getOperatorInfo();
  return (
    <div className="mx-auto w-full max-w-3xl py-6" data-testid="datenschutz-page">
      <h1 className="text-2xl font-semibold">{de ? "Datenschutzerklärung" : "Privacy policy"}</h1>
      {!operator.privacyReviewed && (
        <p role="note" className="mt-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-text" data-testid="privacy-draft">
          {de ? "Entwurf: Die rechtliche Prüfung dieser Erklärung steht noch aus." : "Draft: this policy has not yet been reviewed legally."}
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-text-2">
        {de
          ? "Hier steht, welche Angaben zu dir die Plattform speichert, wozu, wie lange und wer sie bekommt. Dieselben Angaben stehen in deinem Datenexport."
          : "This page lists which details about you the platform stores, why, for how long and who receives them. The same details are in your data export."}
      </p>
      <section className="mt-6" aria-labelledby="privacy-controller">
        <h2 id="privacy-controller" className="mb-2 text-lg font-semibold">{de ? "Verantwortlich" : "Controller"}</h2>
        <OperatorNotice operator={operator} de={de} />
      </section>
      <section className="mt-8" aria-labelledby="privacy-data">
        <h2 id="privacy-data" className="mb-3 text-lg font-semibold">{de ? "Welche Angaben wir verarbeiten" : "Which details we process"}</h2>
        <div className="flex flex-col gap-5">
          {PRIVACY_ENTRIES.map((entry) => {
            const l = de ? "de" : "en";
            return (
              <article key={entry.id} id={entry.id} className="rounded-lg border border-border bg-surface p-4" data-testid="privacy-entry">
                <h3 className="font-semibold">{entry.title[l]}</h3>
                <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm leading-relaxed sm:grid-cols-[9rem_1fr]">
                  <dt className="font-medium text-subtle">{de ? "Angaben" : "Details"}</dt>
                  <dd className="text-text-2">{entry.data[l]}</dd>
                  <dt className="font-medium text-subtle">{de ? "Zweck" : "Purpose"}</dt>
                  <dd className="text-text-2">{entry.purpose[l]}</dd>
                  <dt className="font-medium text-subtle">{de ? "Speicherdauer" : "Retention"}</dt>
                  <dd className="text-text-2">{entry.retention[l]}</dd>
                  <dt className="font-medium text-subtle">{de ? "Empfänger" : "Recipients"}</dt>
                  <dd className="text-text-2">{entry.recipients[l]}</dd>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
      <section className="mt-8" aria-labelledby="privacy-ai">
        <h2 id="privacy-ai" className="mb-2 text-lg font-semibold">{de ? "KI-Dienst" : "AI service"}</h2>
        <p className="text-sm leading-relaxed text-text-2">
          {de
            ? "Für die Karrierepfade nutzt die Plattform die Gemini-Schnittstelle von Google (siehe „Berufsprofil, Skills und Karrierepfade“). Andere KI-Funktionen, etwa die Erstellung und Übersetzung von Kursen, arbeiten mit Kursinhalten und von Firmen hochgeladenen Dokumenten, nicht mit Angaben zu dir."
            : "For career paths the platform uses Google's Gemini interface (see “Career profile, skills and career paths”). Other AI features, such as creating and translating courses, work with course content and documents uploaded by companies, not with details about you."}
        </p>
        {operator.aiStatement ? (
          <p className="mt-2 text-sm leading-relaxed text-text-2" data-testid="ai-statement">{operator.aiStatement}</p>
        ) : (
          <p role="note" className="mt-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-text" data-testid="ai-statement-missing">
            {de
              ? "Verarbeitungsort und Ausschluss des Trainings auf Kundendaten sind noch nicht bestätigt (LEGAL_AI_STATEMENT)."
              : "Processing location and exclusion of training on customer data are not confirmed yet (LEGAL_AI_STATEMENT)."}
          </p>
        )}
      </section>
      <section className="mt-8" aria-labelledby="privacy-technical">
        <h2 id="privacy-technical" className="mb-3 text-lg font-semibold">{de ? "Technisches" : "Technical"}</h2>
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
        <h2 id="privacy-rights" className="mb-2 text-lg font-semibold">{de ? "Deine Rechte" : "Your rights"}</h2>
        <p className="text-sm leading-relaxed text-text-2">{PRIVACY_RIGHTS[de ? "de" : "en"]}</p>
      </section>
    </div>
  );
}
