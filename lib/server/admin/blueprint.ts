import { eq } from "drizzle-orm";
import { CURRICULUM_MODEL } from "@/lib/claude";
import { getDb } from "@/lib/server/db/client";
import { blueprintDrafts, certificationSources, sourceChunks } from "@/lib/server/db/schema";
import { generateBlueprintDraft, type BlueprintExtraction } from "@/lib/server/ai/service";

export type BlueprintDraft = typeof blueprintDrafts.$inferSelect;

export class SourceNotParsedError extends Error {}

/** R1.3: "Nach Freigabe versehentliche Änderungen verhindern" - geworfen,
 * wenn eine erneute Extraktion oder eine Inhalts-Korrektur auf eine bereits
 * freigegebene oder ersetzte Quelle träfe. */
export class BlueprintLockedError extends Error {}

const LOCKED_SOURCE_STATUSES = new Set(["approved", "superseded"]);

const MAX_SOURCE_TEXT_CHARS = 60_000;

/**
 * R1.2 (roadmap.md): baut den seitenmarkierten Text, den die KI als einzige
 * erlaubte Quelle für generateBlueprintDraft() bekommt (siehe dort:
 * `locator` MUSS sich auf eine "== Seite N =="-Markierung beziehen). Für sehr
 * lange Dokumente wird bei `MAX_SOURCE_TEXT_CHARS` abgeschnitten statt den
 * gesamten Text zu senden (Kostenschutz + Kontextgrenze des Modells) - `truncated`
 * macht das sichtbar, statt einen Teil des Dokuments still zu ignorieren.
 */
export function buildSourceText(
  chunks: { pageNumber: number; content: string }[],
): { text: string; truncated: boolean } {
  const sorted = [...chunks].sort((a, b) => a.pageNumber - b.pageNumber);
  let text = "";
  let truncated = false;

  for (const chunk of sorted) {
    const pageText = `== Seite ${chunk.pageNumber} ==\n${chunk.content.trim()}\n\n`;
    if (text.length + pageText.length > MAX_SOURCE_TEXT_CHARS) {
      truncated = true;
      break;
    }
    text += pageText;
  }

  return { text: text.trim(), truncated };
}

export interface BlueprintValidationResult {
  /** Blockiert die Freigabe (approveBlueprintDraft) - siehe R1.3
   * "Validierungsfehler von Hinweisen unterscheiden". */
  errors: string[];
  /** Informativ, blockiert nichts - der Admin kann trotzdem freigeben. */
  warnings: string[];
}

/** R1.2-Nachtrag: stabiler Schlüssel für ein Objective innerhalb eines Drafts
 * (Position in `content.domains[domainIndex].objectives[objectiveIndex]`),
 * genutzt um Confirmations in `blueprint_drafts.confirmedLowConfidenceObjectives`
 * zu referenzieren - dieselbe Formel läuft hier UND in BlueprintReview.tsx
 * (dort dupliziert, da Client-Komponenten dieses Server-Modul nicht
 * importieren dürfen). Code/Titel sind editierbar, die Position innerhalb des
 * Drafts aber nicht (R1.3: "nur Feldkorrektur, keine Strukturänderung") -
 * daher als Schlüssel geeigneter als der (editierbare) Code. */
export function lowConfidenceObjectiveKey(domainIndex: number, objectiveIndex: number): string {
  return `${domainIndex}:${objectiveIndex}`;
}

/**
 * R1.2/R1.3: Plausibilitätsprüfung des KI-Extraktionsvorschlags - reine
 * Funktion (kein KI-Aufruf), damit sie sowohl direkt nach der Generierung als
 * auch bei jeder späteren Korrektur (PATCH) neu ausgeführt werden kann.
 *
 * Nur Duplikate INNERHALB derselben Domain sind ein Error: applyBlueprintDraft
 * (R1.3) matcht Objectives beim Freigeben per Code innerhalb ihrer Domain -
 * ein Duplikat dort würde beim Merge in die echten objectives-Tabellen
 * kommentarlos eine der beiden Zeilen verschlucken. Alles andere bleibt ein
 * Hinweis, den ein Admin bewusst übergehen kann - AUSSER niedriger
 * Extraktionssicherheit (siehe unten): das war bisher nur ein Hinweis, ist
 * jetzt ein Error, solange das jeweilige Objective nicht einzeln in
 * `confirmedLowConfidence` bestätigt wurde (roadmap.md R1.2: "Niedrige
 * Extraktionssicherheit sichtbar machen und manuelle Bestätigung verlangen").
 */
export function validateBlueprintDraft(
  content: BlueprintExtraction,
  confirmedLowConfidence: ReadonlySet<string> = new Set(),
): BlueprintValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const domain of content.domains) {
    const codeCounts = new Map<string, number>();
    for (const objective of domain.objectives) {
      codeCounts.set(objective.code, (codeCounts.get(objective.code) ?? 0) + 1);
    }
    const duplicateCodes = [...codeCounts.entries()]
      .filter(([, occurrences]) => occurrences > 1)
      .map(([code]) => code);
    if (duplicateCodes.length > 0) {
      errors.push(`Domain "${domain.name}": doppelte Objective-Codes: ${duplicateCodes.join(", ")}.`);
    }
  }

  const codeToDomains = new Map<string, Set<string>>();
  for (const domain of content.domains) {
    for (const objective of domain.objectives) {
      const domainNames = codeToDomains.get(objective.code) ?? new Set<string>();
      domainNames.add(domain.name);
      codeToDomains.set(objective.code, domainNames);
    }
  }
  const crossDomainDuplicates = [...codeToDomains.entries()].filter(
    ([, domainNames]) => domainNames.size > 1,
  );
  if (crossDomainDuplicates.length > 0) {
    warnings.push(
      `Objective-Code(s) in mehreren Domains verwendet: ${crossDomainDuplicates.map(([code]) => code).join(", ")}.`,
    );
  }

  const weights = content.domains.map((domain) => domain.weightPercent);
  if (weights.every((weight) => weight !== null)) {
    const sum = weights.reduce((total, weight) => total + (weight ?? 0), 0);
    // Toleranz statt exakt 100, da Rundungsdifferenzen in offiziellen
    // Dokumenten selbst üblich sind (siehe roadmap.md: "sollte typischerweise
    // 100 ergeben").
    if (Math.abs(sum - 100) > 2) {
      warnings.push(`Summe der Domain-Gewichtungen ist ${sum}%, nicht 100%.`);
    }
  } else if (weights.some((weight) => weight !== null)) {
    warnings.push("Nicht für alle Domains wurde eine Gewichtung erkannt.");
  }

  for (const domain of content.domains) {
    const subCodes = domain.objectives
      .map((objective) => /^\d+\.(\d+)$/.exec(objective.code.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number.parseInt(match[1], 10))
      .sort((a, b) => a - b);
    for (let i = 1; i < subCodes.length; i++) {
      if (subCodes[i] - subCodes[i - 1] > 1) {
        warnings.push(
          `Domain "${domain.name}": mögliche Lücke zwischen Objective .${subCodes[i - 1]} und .${subCodes[i]}.`,
        );
      }
    }
  }

  const unconfirmedLowConfidence: string[] = [];
  content.domains.forEach((domain, domainIndex) => {
    domain.objectives.forEach((objective, objectiveIndex) => {
      if (objective.confidence >= 0.5) return;
      const key = lowConfidenceObjectiveKey(domainIndex, objectiveIndex);
      if (!confirmedLowConfidence.has(key)) {
        unconfirmedLowConfidence.push(
          `Domain "${domain.name}": Objective ${objective.code} hat niedrige Extraktionssicherheit (${Math.round(objective.confidence * 100)} %) und muss vor der Freigabe einzeln bestätigt werden.`,
        );
      }
    });
  });
  errors.push(...unconfirmedLowConfidence);

  // Prüfungsrealismus-Ergänzung zu R1.2: nur ein Hinweis, kein Error - viele
  // offizielle Objective-Dokumente nennen Fragenanzahl/Zeitlimit gar nicht
  // (steht dann nur auf der Anbieter-Webseite), das soll die Freigabe nicht
  // blockieren.
  if (
    content.examQuestionCount === null &&
    content.examDurationMinutes === null &&
    content.passingScore === null
  ) {
    warnings.push(
      "Kein Prüfungsformat (Fragenanzahl/Zeitlimit/Bestehensgrenze) im Dokument gefunden - Übungsprüfung nutzt den generischen Default, bis das manuell ergänzt wird.",
    );
  }

  return { errors, warnings };
}

/**
 * R1.2: "Slug aus Name und Prüfungscode vorschlagen, aber editierbar
 * lassen" - reiner Vorschlag, PATCH .../blueprint kann ihn überschreiben.
 * Folgt demselben Muster wie das slug-Feld im bestehenden
 * "Kurs hinzufügen"-Formular (app/admin/actions.ts): a-z0-9 und Bindestriche.
 */
export function suggestSlug(name: string, examCode: string): string {
  return `${name} ${examCode}`
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function getBlueprintDraft(sourceId: string): Promise<BlueprintDraft | null> {
  const [draft] = await getDb()
    .select()
    .from(blueprintDrafts)
    .where(eq(blueprintDrafts.sourceId, sourceId))
    .limit(1);
  return draft ?? null;
}

/**
 * R1.2: startet die KI-Extraktion für eine bereits geparste Quelle (R1.1) und
 * speichert das Ergebnis. Ein Draft pro Quelle - ein erneuter Aufruf
 * überschreibt den bisherigen statt einen zweiten anzulegen (siehe
 * onConflictDoUpdate), setzt dabei editedByUserId/editedAt zurück, da die
 * manuelle Slug-Korrektur einer vorherigen Generierung sonst fälschlich für
 * den neuen Vorschlag gelten würde.
 */
export async function generateAndStoreBlueprintDraft(
  sourceId: string,
  userId: string,
): Promise<BlueprintDraft> {
  const db = getDb();
  const [source] = await db
    .select()
    .from(certificationSources)
    .where(eq(certificationSources.id, sourceId))
    .limit(1);
  if (!source) throw new SourceNotParsedError(`Quelle ${sourceId} nicht gefunden.`);
  if (LOCKED_SOURCE_STATUSES.has(source.status)) {
    throw new BlueprintLockedError(
      "Diese Quelle ist bereits freigegeben oder ersetzt - keine erneute Extraktion mehr möglich.",
    );
  }
  if (!["parsed", "reviewed"].includes(source.status)) {
    throw new SourceNotParsedError(
      'Die Quelle muss zuerst per Textextraktion verarbeitet werden (Status "parsed").',
    );
  }

  const chunks = await db
    .select({ pageNumber: sourceChunks.pageNumber, content: sourceChunks.content })
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId));
  if (chunks.length === 0) {
    throw new SourceNotParsedError("Für diese Quelle liegt noch kein extrahierter Text vor.");
  }

  const { text, truncated } = buildSourceText(chunks);
  const content = await generateBlueprintDraft(text);
  const { errors, warnings } = validateBlueprintDraft(content);
  const suggestedSlug = suggestSlug(content.certificationName, content.examCode);

  const [draft] = await db
    .insert(blueprintDrafts)
    .values({
      sourceId,
      certificationId: source.certificationId,
      content,
      suggestedSlug,
      validationErrors: errors,
      warnings,
      truncatedSource: truncated,
      modelVersion: CURRICULUM_MODEL,
      promptVersion: "v1",
      generatedByUserId: userId,
    })
    .onConflictDoUpdate({
      target: blueprintDrafts.sourceId,
      set: {
        content,
        suggestedSlug,
        validationErrors: errors,
        warnings,
        truncatedSource: truncated,
        // Neuer Inhalt => vorherige Bestätigungen beziehen sich auf jetzt
        // überschriebene Objectives an denselben Positionen, siehe
        // lowConfidenceObjectiveKey() - müssen erneut geprüft werden.
        confirmedLowConfidenceObjectives: [],
        modelVersion: CURRICULUM_MODEL,
        promptVersion: "v1",
        generatedByUserId: userId,
        editedByUserId: null,
        editedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return draft;
}

export interface BlueprintDraftUpdate {
  /** Bereits gegen blueprintExtractionSchema validiert - siehe PATCH-Route,
   * die die eingehenden Rohdaten vor dem Aufruf hier prüft. */
  content?: BlueprintExtraction;
  suggestedSlug?: string;
  /** R1.2-Nachtrag: Positions-Keys (lowConfidenceObjectiveKey) der niedrig-
   * konfidenten Objectives, die der Admin gerade bestätigt hat - ersetzt den
   * bisherigen Stand vollständig (wie `content`), nicht additiv. */
  confirmedLowConfidenceObjectives?: string[];
}

/**
 * R1.3: "Felder inline korrigierbar machen" + "Entwurf speichern" -
 * überschreibt content und/oder suggestedSlug eines bestehenden Drafts. Bei
 * einer Inhalts-Korrektur werden errors/warnings neu berechnet (nie separat
 * vom Admin gepflegt), und die Quelle rückt beim ersten Edit von "parsed" auf
 * "reviewed" vor (Signal: ein Mensch hat sich das angesehen). Blockiert
 * (BlueprintLockedError), sobald die Quelle bereits freigegeben oder ersetzt
 * ist - siehe "Nach Freigabe versehentliche Änderungen verhindern".
 */
export async function updateBlueprintDraftContent(
  sourceId: string,
  update: BlueprintDraftUpdate,
  userId: string,
): Promise<BlueprintDraft | null> {
  const db = getDb();
  const [source] = await db
    .select()
    .from(certificationSources)
    .where(eq(certificationSources.id, sourceId))
    .limit(1);
  if (!source) return null;
  if (LOCKED_SOURCE_STATUSES.has(source.status)) {
    throw new BlueprintLockedError(
      "Diese Quelle ist bereits freigegeben oder ersetzt - keine Korrekturen mehr möglich.",
    );
  }

  const setValues: Partial<typeof blueprintDrafts.$inferInsert> = {
    editedByUserId: userId,
    editedAt: new Date(),
    updatedAt: new Date(),
  };

  if (update.content || update.confirmedLowConfidenceObjectives !== undefined) {
    // errors/warnings hängen von BEIDEM ab (Inhalt + Bestätigungen), also bei
    // jeder Änderung eines der beiden neu berechnen - dafür den jeweils nicht
    // mitgesendeten Teil aus dem bestehenden Draft nachladen, statt ihn
    // fälschlich als leer/fehlend zu behandeln.
    const existing = await getBlueprintDraft(sourceId);
    const effectiveContent = update.content ?? (existing?.content as unknown as BlueprintExtraction);
    const effectiveConfirmed = new Set(
      update.confirmedLowConfidenceObjectives ?? existing?.confirmedLowConfidenceObjectives ?? [],
    );
    const { errors, warnings } = validateBlueprintDraft(effectiveContent, effectiveConfirmed);
    if (update.content) setValues.content = update.content;
    if (update.confirmedLowConfidenceObjectives !== undefined) {
      setValues.confirmedLowConfidenceObjectives = update.confirmedLowConfidenceObjectives;
    }
    setValues.validationErrors = errors;
    setValues.warnings = warnings;
  }
  if (update.suggestedSlug !== undefined) {
    setValues.suggestedSlug = update.suggestedSlug;
  }

  const [draft] = await db
    .update(blueprintDrafts)
    .set(setValues)
    .where(eq(blueprintDrafts.sourceId, sourceId))
    .returning();
  if (!draft) return null;

  if (source.status === "parsed") {
    await db
      .update(certificationSources)
      .set({ status: "reviewed" })
      .where(eq(certificationSources.id, sourceId));
  }

  return draft;
}
