import { eq } from "drizzle-orm";
import { GEMINI_MODEL } from "@/lib/gemini";
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
 * gesamten Text zu senden (Kostenschutz + Gemini-Kontextgrenze) - `truncated`
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

/**
 * R1.2/R1.3: Plausibilitätsprüfung des KI-Extraktionsvorschlags - reine
 * Funktion (kein KI-Aufruf), damit sie sowohl direkt nach der Generierung als
 * auch bei jeder späteren Korrektur (PATCH) neu ausgeführt werden kann.
 *
 * Nur Duplikate INNERHALB derselben Domain sind ein Error: applyBlueprintDraft
 * (R1.3) matcht Objectives beim Freigeben per Code innerhalb ihrer Domain -
 * ein Duplikat dort würde beim Merge in die echten objectives-Tabellen
 * kommentarlos eine der beiden Zeilen verschlucken. Alles andere bleibt ein
 * Hinweis, den ein Admin bewusst übergehen kann.
 */
export function validateBlueprintDraft(content: BlueprintExtraction): BlueprintValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const allObjectives = content.domains.flatMap((domain) => domain.objectives);

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

  const lowConfidenceCount = allObjectives.filter((objective) => objective.confidence < 0.5).length;
  if (lowConfidenceCount > 0) {
    warnings.push(
      `${lowConfidenceCount} Objective(s) mit niedriger Extraktionssicherheit (< 50 %) - manuell prüfen.`,
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
      modelVersion: GEMINI_MODEL,
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
        modelVersion: GEMINI_MODEL,
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

  if (update.content) {
    const { errors, warnings } = validateBlueprintDraft(update.content);
    setValues.content = update.content;
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
