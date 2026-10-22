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
      </div>
    </details>
  );
}
