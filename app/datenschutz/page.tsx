export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { OperatorNotice } from "@/components/legal/OperatorNotice";
import { getOperatorInfo } from "@/lib/legal/operator";
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
      <section className="mt-6" aria-labelledby="privacy-controller">
        <h2 id="privacy-controller" className="mb-2 text-lg font-semibold">{de ? "Verantwortlich" : "Controller"}</h2>
        <OperatorNotice operator={operator} de={de} />
      </section>
    </div>
  );
}
