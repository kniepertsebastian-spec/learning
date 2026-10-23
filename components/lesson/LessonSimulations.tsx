"use client";

import * as React from "react";
import { RichText } from "@/components/RichText";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { enqueueSyncEvent } from "@/lib/client/sync-queue";
import { useLocaleOptional } from "@/lib/i18n";
import { extractSimulationSources, simulationIndex, stripSimulations } from "@/lib/markdown/simulation";

/**
 * Verbindung zwischen Lektionstext und Simulationen (roadmap3.md, Schritt 5): die Simulation kann den Lektionstext in
 * einem Seitenblatt öffnen (auch auf eine Überschrift gesprungen), ohne dass ihr Stand verloren geht, und meldet, wenn
 * sie gelöst wurde. Außerhalb der Lektionsseite (Werkstatt-Vorschau, Fragen) gibt es keinen Provider: dann entfallen
 * beide Funktionen.
 */
export type SimulationProgressEntry = { bestHelps: number };

type Ctx = {
  solved: ReadonlyMap<number, SimulationProgressEntry>;
  simCount: number;
  openText: (heading?: string) => void;
  /** Meldet eine gelöste Runde (`helps` = Hilfen); gibt an, ob die Wiederholungsfragen vorgezogen wurden. */
  reportSolved: (spec: string, helps: number) => Promise<{ struggled: boolean } | null>;
  headings: string[];
  /** Position der Simulation in der Lektion (0-basiert, -1 unbekannt): für Sprungmarken wie #simulation-2. */
  indexOf: (spec: string) => number;
  /** Firmenbereich mit zugeordnetem Mentor: „Ich hänge fest“ bei jeder Simulation (Thema = Lektion). */
  mentorAsk: { topic: string; certificationId: string } | null;
};

const LessonSimulationsContext = React.createContext<Ctx | null>(null);
export const useLessonSimulations = () => React.useContext(LessonSimulationsContext);

export function LessonSimulationsProvider({
  text,
  sectionId,
  persist,
  offlineUserId,
  initialProgress,
  mentorAsk = null,
  children,
}: {
  text: string;
  sectionId: string;
  /** false im Offline-Reader und ohne Anmeldung: nicht direkt gespeichert (offline geht es über die Sync-Warteschlange). */
  persist: boolean;
  /** Im Offline-Reader: gelöste Simulationen gehen in die Sync-Warteschlange dieser Person. */
  offlineUserId?: string;
  initialProgress: Array<{ simIndex: number; bestHelps: number }>;
  /** Nur online und nur mit zugeordnetem Mentor (nur durch die lernende Person ausgelöst). */
  mentorAsk?: { topic: string; certificationId: string } | null;
  children: React.ReactNode;
}) {
  const { t } = useLocaleOptional();
  const sources = React.useMemo(() => extractSimulationSources(text), [text]);
  const [solved, setSolved] = React.useState<Map<number, SimulationProgressEntry>>(() => new Map(initialProgress.map((p) => [p.simIndex, { bestHelps: p.bestHelps }])));
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const reading = React.useMemo(() => stripSimulations(text), [text]);
  const headings = React.useMemo(() => [...reading.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)].map((m) => m[1].replace(/[`*_]/g, "")), [reading]);

  const reportSolved = React.useCallback(
    async (spec: string, helps: number) => {
      const idx = simulationIndex(sources, spec);
      if (idx < 0) return null;
      setSolved((m) => {
        const next = new Map(m);
        next.set(idx, { bestHelps: Math.min(m.get(idx)?.bestHelps ?? helps, helps) });
        return next;
      });
      // Offline-Reader: in die Sync-Warteschlange, wird beim nächsten Online-Sync gespeichert (wie das Abschnittsquiz).
      if (offlineUserId) {
        await enqueueSyncEvent(offlineUserId, "simulation_result", { sectionId, simIndex: idx, helps }, "Simulation").catch(() => {});
        return null;
      }
      if (!persist) return null;
      try {
        const res = await fetch(`/api/sections/${sectionId}/simulations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ simIndex: idx, helps }) });
        return res.ok ? ((await res.json()) as { struggled: boolean }) : null;
      } catch {
        return null;
      }
    },
    [sources, persist, sectionId, offlineUserId],
  );

  const openText = React.useCallback((heading?: string) => {
    setTarget(heading ?? null);
    setOpen(true);
  }, []);

  // Nach dem Öffnen zur gewünschten Überschrift springen (das Blatt rendert seinen Inhalt erst beim Öffnen).
  React.useEffect(() => {
    if (!open || !target) return;
    const id = window.setTimeout(() => {
      const el = [...(bodyRef.current?.querySelectorAll("h1, h2, h3, h4") ?? [])].find((h) => h.textContent?.trim() === target.trim());
      el?.scrollIntoView({ block: "start" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, target]);

  const indexOf = React.useCallback((spec: string) => simulationIndex(sources, spec), [sources]);
  const value = React.useMemo<Ctx>(() => ({ solved, simCount: sources.length, openText, reportSolved, headings, indexOf, mentorAsk }), [solved, sources.length, openText, reportSolved, headings, indexOf, mentorAsk]);

  return (
    <LessonSimulationsContext.Provider value={value}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[min(640px,100vw)]" data-testid="lesson-text-sheet">
          <SheetTitle>{t.lesson_blocks.simTextTitle}</SheetTitle>
          <SheetDescription>{t.lesson_blocks.simTextHint}</SheetDescription>
          <div ref={bodyRef} className="mt-4 text-[15px] leading-[1.7] text-text-2 [&_p]:my-3 [&_h1]:mt-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold">
            <RichText text={reading} />
          </div>
        </SheetContent>
      </Sheet>
    </LessonSimulationsContext.Provider>
  );
}
