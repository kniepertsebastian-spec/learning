export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { OperatorNotice } from "@/components/legal/OperatorNotice";
import { c_legalPages } from "@/lib/i18n/components/legalPages";
import { getOperatorInfo } from "@/lib/legal/operator";
import { getServerLocale } from "@/lib/server/locale";

/** Ohne vollständige Angaben des Betreibers bleibt die Seite für Suchmaschinen gesperrt. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Impressum / Imprint", robots: getOperatorInfo().complete ? undefined : { index: false, follow: false } };
}

/** Impressum (Aufgabe 07a, Review 12.11.2026): ohne Anmeldung erreichbar. Die Angaben stehen in der Umgebung des Servers, siehe lib/legal/operator.ts. */
export default async function ImpressumPage() {
  const de = (await getServerLocale()) === "de";
  const t = c_legalPages(de);
  const operator = getOperatorInfo();
  return (
    <div className="mx-auto w-full max-w-3xl py-6" data-testid="impressum-page">
      <h1 className="text-2xl font-semibold">{t.imprintTitle}</h1>
      <p className="mt-1 text-sm text-subtle">{t.imprintIntro}</p>
      <section className="mt-6" aria-labelledby="imprint-operator">
        <h2 id="imprint-operator" className="mb-2 text-lg font-semibold">{t.operator}</h2>
        <OperatorNotice operator={operator} de={de} />
      </section>
    </div>
  );
}
