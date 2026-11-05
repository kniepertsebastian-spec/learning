"use client";

import { AiBatchPanel } from "@/components/admin/AiBatchPanel";
import { useTr, type Lang } from "@/components/admin/workshop/shared";

/** Nachträge für alle allgemeinen Kurse auf einmal (Sammelläufe der KI-Nachbesserung). */
export function AdminAiBatches({ locale }: { locale: Lang }) {
  const tr = useTr(locale);
  return (
    <details className="mb-6 rounded-2xl border border-border bg-surface p-4" data-testid="admin-ai-batches">
      <summary className="cursor-pointer text-sm font-semibold">{tr("Nachträge für alle Kurse (KI)", "Backfills for all courses (AI)")}</summary>
      <p className="mt-2 text-sm text-subtle">
        {tr(
          "Wendet neuere Funktionen auch auf bestehende Kurse an. Es betrifft nur allgemeine Kurse, keine internen Kurse von Firmen. Vorher siehst du Anzahl und geschätzte Kosten.",
          "Applies newer features to existing courses too. Only general courses are affected, not companies' internal courses. You see the count and estimated cost first.",
        )}
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <AiBatchPanel
          kind="stale"
          certificationId={null}
          locale={locale}
          title={tr("Veraltete und fehlende Inhalte neu erzeugen", "Regenerate outdated and missing content")}
          description={tr("Nach einer neuen Quellenversion sind betroffene Lektionen und Fragen veraltet, neue Lernziele haben noch keine Inhalte. Erzeugt sie aus den Quellenausschnitten des Lernziels neu: Veraltete Lektionen werden ersetzt (der alte Text bleibt als Version), veraltete Fragen bleiben stehen und neue kommen dazu, Fragen ohne belegte Quelle werden verworfen. Lernziele ohne Quelle werden übersprungen. Vorher wird der Kursstand gemerkt.", "After a new source version, the affected lessons and questions are outdated, and new objectives have no content yet. Regenerates them from the objective's source excerpts: outdated lessons are replaced (the old text stays as a version), outdated questions stay and new ones are added, questions without a cited source are discarded. Objectives without a source are skipped. A course snapshot is saved first.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="simulations"
          certificationId={null}
          locale={locale}
          title={tr("Simulationen für alle Kurse ergänzen", "Add simulations to all courses")}
          description={tr("Ergänzt in jeder Lektion ohne Simulation eine interaktive Übung, wo sich das Thema eignet.", "Adds an interactive exercise to every lesson without a simulation where the topic suits it.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="concepts"
          certificationId={null}
          locale={locale}
          title={tr("Konzepte und Abfragen für alle Kurse", "Concepts and probes for all courses")}
          description={tr("Konzept-Tagging und Abfragevarianten für die Wiederholungsplanung in allen Kursen, die sie noch nicht haben.", "Concept tagging and probe variants for review scheduling in all courses that do not have them yet.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="variants"
          certificationId={null}
          locale={locale}
          title={tr("Varianten für die Wiederholung ergänzen", "Add review variants")}
          description={tr("Erzeugt je Frage mindestens zwei Varianten (anderer Kontext, gleiches Wissen), damit die Wiederholung nicht dieselbe Frage wiederholt.", "Creates at least two variants per question (different context, same knowledge) so reviews do not repeat the same question.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="explanations"
          certificationId={null}
          locale={locale}
          title={tr("Alternativerklärungen für den Verstehens-Modus", "Alternative explanations for understanding mode")}
          description={tr("Erzeugt je Lernziel ein durchgerechnetes Beispiel, ein Lückenbeispiel und eine Analogie als Entwurf. Gezeigt werden sie erst nach deiner Freigabe in der Werkstatt.", "Creates a worked example, a gapped example and an analogy per objective as drafts. They are only shown after you approve them in the workshop.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="prerequisites"
          certificationId={null}
          locale={locale}
          title={tr("Voraussetzungen zwischen Konzepten vorschlagen", "Suggest prerequisites between concepts")}
          description={tr("Schlägt vor, welches Konzept auf welchem aufbaut (Brücke im Verstehens-Modus, Bezug beim Einweben). Nur Entwürfe bis zur Freigabe; setzt Konzepte voraus (siehe oben).", "Suggests which concept builds on which (bridge in understanding mode, link for woven reviews). Drafts until approved; needs concepts (see above).")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="formats"
          certificationId={null}
          locale={locale}
          title={tr("Formatfragen ergänzen", "Add format questions")}
          description={tr("Ergänzt für Lernziele, die nur Auswahlfragen haben, je zwei Fragen mit Reihenfolge, Kurzantwort oder Zuordnung.", "Adds two questions with ordering, short answer or matching for objectives that only have multiple-choice questions.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="rationales"
          certificationId={null}
          locale={locale}
          title={tr("Begründungen zu falschen Antworten ergänzen", "Add reasons for wrong answers")}
          description={tr("Erzeugt für Fragen, bei denen eine falsche Option noch keine Begründung hat, kurze Begründungen. Vorhandene werden nie überschrieben.", "Creates short reasons for questions where a wrong option has none yet. Existing ones are never overwritten.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="blocks"
          certificationId={null}
          locale={locale}
          title={tr("Lernblöcke in Lektionen einfügen", "Add learning blocks to lessons")}
          description={tr("Fügt in Lektionen ganz ohne Hinweise, Terminal- oder Praxisbeispiele solche Blöcke ein. Der Text bleibt, die Änderung wird abgelehnt, wenn Sätze fehlen.", "Adds notes, terminal and practice blocks to lessons that have none. The text stays; the change is rejected if sentences go missing.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="possible"
          certificationId={null}
          locale={locale}
          title={tr("„Was damit möglich ist“ ergänzen", "Add “what this makes possible”")}
          description={tr("Ergänzt in Lektionen den Hinweis „Was damit möglich ist“ und Textverweise in Simulationen. Vorher wird der Kursstand gemerkt.", "Adds the “what this makes possible” note to lessons and text references to simulations. The course state is saved first.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
      </div>
    </details>
  );
}
