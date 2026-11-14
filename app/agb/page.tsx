export const dynamic = "force-dynamic";

import { c_agbPage } from "@/lib/i18n/components/agbPage";
import type { Metadata } from "next";
import Link from "next/link";
import { OperatorNotice } from "@/components/legal/OperatorNotice";
import { getOperatorInfo } from "@/lib/legal/operator";
import { getServerLocale } from "@/lib/server/locale";

export const metadata: Metadata = { title: "AGB / Service Agreements" };

/**
 * Service Agreements / AGB: hier stehen die Aussagen, die bewusst nicht in den Kursbeschreibungen stehen (roadmap_bugs_features 3.2):
 * was die fachliche Prüfung bedeutet, dass es keine Bestehensgarantie gibt und wie es sich mit den Prüfungsbedingungen der Anbieter verhält.
 * Dazu Parteien, Laufzeit und Kündigung, Haftung und der Verweis auf den Datenschutz (Aufgabe 08, Review 12.11.2026). Der Wortlaut
 * von Laufzeit, Kündigung und Haftung ist ein Entwurf, den der Betreiber rechtlich prüfen lassen und mit `LEGAL_TERMS_REVIEWED=true`
 * freigeben muss; bis dahin trägt die Seite einen Hinweis. Die Angaben zum Betreiber kommen aus der Umgebung (lib/legal/operator.ts).
 */
export default async function AgbPage() {
  const locale = await getServerLocale();
  const de = locale === "de";
  const operator = getOperatorInfo();
  const sections = de
    ? [
        {
          id: "parteien",
          title: "Vertragspartner und Geltung",
          text: "Vertragspartner ist der unten genannte Betreiber der Plattform und die Person, die ein Konto anlegt (bei Firmenkonten zusätzlich die Firma, der das Konto zugeordnet ist). Diese Bedingungen gelten für die Nutzung der Plattform mit ihren Kursen, Übungen, Prüfungssimulationen und Planungsfunktionen. Der Betreiber kann den Funktionsumfang weiterentwickeln; wesentliche Änderungen dieser Bedingungen werden vorab angekündigt.",
          party: true,
        },
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
        {
          id: "laufzeit-kuendigung",
          title: "Laufzeit und Kündigung",
          text: "Das Nutzungsverhältnis besteht ab der Anlage des Kontos und läuft auf unbestimmte Zeit. Du kannst es jederzeit beenden, indem du dein Konto unter „Konto“ löschst; dabei werden deine Daten gelöscht oder, soweit sie einen Vorgang der Plattform betreffen, anonymisiert (siehe Datenschutzerklärung). Bei Firmenkonten kann auch die Firma den Zugang beenden. Der Betreiber kann das Nutzungsverhältnis aus wichtigem Grund beenden, insbesondere bei Missbrauch der Plattform.",
        },
        {
          id: "haftung",
          title: "Haftung",
          text: "Der Betreiber haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit, für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit und nach dem Produkthaftungsgesetz. Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vorhersehbaren, typischen Schaden begrenzt; wesentlich sind Pflichten, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags erst ermöglicht. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen. Für die Richtigkeit von Prüfungsbedingungen der Anbieter und für das Bestehen einer Prüfung übernimmt der Betreiber keine Haftung (siehe oben).",
        },
        {
          id: "datenschutz",
          title: "Datenschutz",
          text: "Welche Angaben die Plattform verarbeitet, steht in der Datenschutzerklärung.",
          link: "/datenschutz",
        },
      ]
    : [
        {
          id: "parteien",
          title: "Contracting parties and scope",
          text: "The contract is between the operator of the platform named below and the person who creates an account (for company accounts also the company the account is assigned to). These terms apply to the use of the platform with its courses, exercises, exam simulations and planning features. The operator may further develop the scope of functions; material changes to these terms are announced in advance.",
          party: true,
        },
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
        {
          id: "laufzeit-kuendigung",
          title: "Term and termination",
          text: "The contract starts when the account is created and runs for an indefinite period. You can end it at any time by deleting your account under “Account”; your data is then deleted or, where it belongs to a platform record, anonymised (see the privacy policy). For company accounts the company can also end access. The operator may end the contract for good cause, in particular in case of misuse of the platform.",
        },
        {
          id: "haftung",
          title: "Liability",
          text: "The operator is liable without limitation for intent and gross negligence, for injury to life, body or health, and under the Product Liability Act. In case of slightly negligent breach of essential contractual duties, liability is limited to the foreseeable, typical damage; essential duties are those whose fulfilment makes proper performance of the contract possible in the first place. Otherwise liability for slight negligence is excluded. The operator accepts no liability for the correctness of providers' exam conditions or for passing an exam (see above).",
        },
        {
          id: "datenschutz",
          title: "Data protection",
          text: "Which details the platform processes is set out in the privacy policy.",
          link: "/datenschutz",
        },
      ];
  return (
    <div className="mx-auto w-full max-w-3xl py-6" data-testid="agb-page">
      <h1 className="text-2xl font-semibold">{c_agbPage(de).termsOfService}</h1>
      <p className="mt-1 text-sm text-subtle">{c_agbPage(de).conditionsOfUse}</p>
      {!operator.termsReviewed && (
        <p role="note" className="mt-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-text" data-testid="terms-draft">
          {c_agbPage(de).draftNotice}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-6">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id}>
            <h2 className="text-lg font-semibold">§ {i + 1} {s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-2">{s.text}</p>
            {s.party && <div className="mt-3"><OperatorNotice operator={operator} de={de} /></div>}
            {s.link && <p className="mt-2 text-sm"><Link href={s.link} className="text-link hover:underline">{c_agbPage(de).toPrivacyPolicy}</Link></p>}
          </section>
        ))}
      </div>
    </div>
  );
}
