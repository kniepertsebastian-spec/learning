/** Freigabe je Inhaltsstand (roadmap_pruefer Phase 2): Hash und Änderungserkennung über Fingerabdrücke, ohne Datenbank. */
import { createHash } from "node:crypto";

export interface CourseFingerprints {
  /** Abschnitt-ID → Fingerabdruck seines bearbeitbaren Stands */
  sections: Record<string, string>;
  /** Frage-ID → Fingerabdruck (Fragen und aktive Varianten) */
  questions: Record<string, string>;
}

/** Deterministischer Hash über alle Fingerabdrücke: gleicher Inhalt ergibt immer denselben Wert, unabhängig von der Reihenfolge. */
export function contentHash(fingerprints: CourseFingerprints): string {
  const lines = [
    ...Object.entries(fingerprints.sections).map(([id, fp]) => `s:${id}:${fp}`),
    ...Object.entries(fingerprints.questions).map(([id, fp]) => `q:${id}:${fp}`),
  ].sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

export interface FingerprintDiff {
  sections: { added: string[]; removed: string[]; changed: string[] };
  questions: { added: string[]; removed: string[]; changed: string[] };
}

function diffMap(base: Record<string, string>, current: Record<string, string>) {
  return {
    added: Object.keys(current).filter((id) => !(id in base)).sort(),
    removed: Object.keys(base).filter((id) => !(id in current)).sort(),
    changed: Object.keys(current).filter((id) => id in base && base[id] !== current[id]).sort(),
  };
}

/** Was hat sich gegenüber dem freigegebenen Stand geändert? Neue Varianten zählen als hinzugefügte Fragen. */
export function diffFingerprints(base: CourseFingerprints, current: CourseFingerprints): FingerprintDiff {
  return { sections: diffMap(base.sections, current.sections), questions: diffMap(base.questions, current.questions) };
}

export function countChanges(diff: FingerprintDiff): number {
  return [diff.sections, diff.questions].reduce((n, d) => n + d.added.length + d.removed.length + d.changed.length, 0);
}

/** Nächste Versionsnummer: Freigabe zählt die Hauptnummer hoch („1.0“, „2.0“), redaktionelle Änderung die Nebennummer („1.1“). */
export function nextVersionLabel(previous: string | null, kind: "approval" | "editorial"): string {
  const match = previous?.match(/^(\d+)\.(\d+)$/);
  const major = match ? Number(match[1]) : 0;
  const minor = match ? Number(match[2]) : 0;
  return kind === "approval" ? `${major + 1}.0` : `${Math.max(major, 1)}.${minor + 1}`;
}
