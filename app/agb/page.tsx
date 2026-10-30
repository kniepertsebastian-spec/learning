export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getServerLocale } from "@/lib/server/locale";

export const metadata: Metadata = { title: "AGB / Service Agreements" };

/**
 * Service Agreements / AGB: hier stehen die Aussagen, die bewusst nicht in den Kursbeschreibungen stehen (roadmap_bugs_features 3.2):
 * was die fachliche Prüfung bedeutet, dass es keine Bestehensgarantie gibt und wie es sich mit den Prüfungsbedingungen der Anbieter verhält.
 * Der vollständige Vertragstext (Parteien, Laufzeit, Haftung, Datenschutz) gehört dem Betreiber und ist hier zu ergänzen.
 */
export default async function AgbPage() {
  const locale = await getServerLocale();
  const de = locale === "de";
  const sections = de
    ? [
        {
          id: "fachliche-pruefung",
          title: "Fachliche Prüfung der Kurse",
          text: "Allgemeine Kurse werden von fachlichen Prüferinnen und Prüfern durchgesehen. „Geprüft“ bezieht sich auf die fachliche Richtigkeit der Inhalte zum jeweils angegebenen Stand (Version und Datum). Nach Änderungen kann der Inhalt vom geprüften Stand abweichen; das ist am Kurs kenntlich gemacht.",
        },
        {
          id: "keine-bestehensgarantie",
          title: "Keine Bestehensgarantie",
          text: "Die Kurse bereiten auf Prüfungen vor. Sie ersetzen nicht die Prüfung selbst, und weder ein abgeschlossener Kurs noch ein gutes Ergebnis in Quizzen, Simulationen oder Probeprüfungen garantiert das Bestehen einer Prüfung eines Anbieters. Einschätzungen zur Prüfungsbereitschaft sind Orientierungswerte.",
        },
        {
          id: "pruefungsbedingungen",
          title: "Prüfungsbedingungen der Anbieter",
          text: "Termine, Gebühren, Zulassungsvoraussetzungen, Bestehensgrenzen und weitere Bedingungen der offiziellen Prüfungen legen die jeweiligen Prüfungsanbieter fest und können sich ändern. Maßgeblich sind allein die Angaben des Anbieters. Ein im Kurs hinterlegter Prüfungstermin ist ein unverbindlicher Richtwert zur Einteilung des Lernpensums.",
        },
      ]
    : [
        {
          id: "fachliche-pruefung",
          title: "Expert review of courses",
          text: "General courses are reviewed by subject-matter experts. “Reviewed” refers to the technical correctness of the content at the stated date (version and date). After changes the content may differ from the reviewed state; this is marked on the course.",
        },
        {
          id: "keine-bestehensgarantie",
          title: "No guarantee of passing",
          text: "The courses prepare you for exams. They do not replace the exam itself, and neither a completed course nor good results in quizzes, simulations or practice exams guarantee that you pass an exam of a provider. Readiness assessments are guidance only.",
        },
        {
          id: "pruefungsbedingungen",
          title: "Exam conditions of the providers",
          text: "Dates, fees, admission requirements, passing scores and other conditions of the official exams are set by the exam providers and may change. Only the provider's information is authoritative. An exam date stored in a course is a non-binding guide for planning your study load.",
        },
      ];
  return (
    <div className="mx-auto w-full max-w-3xl py-6" data-testid="agb-page">
      <h1 className="text-2xl font-semibold">{de ? "AGB / Service Agreements" : "Terms of service"}</h1>
      <p className="mt-1 text-sm text-subtle">{de ? "Auszug: Aussagen zu Prüfung, Bestehen und Prüfungsbedingungen." : "Excerpt: statements on review, passing and exam conditions."}</p>
      <div className="mt-6 flex flex-col gap-6">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id}>
            <h2 className="text-lg font-semibold">§ {i + 1} {s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-2">{s.text}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
