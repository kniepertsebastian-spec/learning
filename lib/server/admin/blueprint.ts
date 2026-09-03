import { eq } from "drizzle-orm";
import { GEMINI_MODEL } from "@/lib/gemini";
import { getDb } from "@/lib/server/db/client";
import { blueprintDrafts, certificationSources, sourceChunks } from "@/lib/server/db/schema";
import { generateBlueprintDraft, type BlueprintExtraction } from "@/lib/server/ai/service";

export type BlueprintDraft = typeof blueprintDrafts.$inferSelect;

export class SourceNotParsedError extends Error {}

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

/**
 * R1.2: Plausibilitätsprüfung des KI-Extraktionsvorschlags - reine Funktion
 * (kein KI-Aufruf), damit sie sowohl direkt nach der Generierung als auch bei
 * jeder späteren Korrektur (PATCH, R1.3) neu ausgeführt werden kann.
 */
export function validateBlueprintDraft(content: BlueprintExtraction): string[] {
  const warnings: string[] = [];
  const allObjectives = content.domains.flatMap((domain) => domain.objectives);

  const codeCounts = new Map<string, number>();
  for (const objective of allObjectives) {
    codeCounts.set(objective.code, (codeCounts.get(objective.code) ?? 0) + 1);
  }
  const duplicateCodes = [...codeCounts.entries()]
    .filter(([, occurrences]) => occurrences > 1)
    .map(([code]) => code);
  if (duplicateCodes.length > 0) {
    warnings.push(`Doppelte Objective-Codes: ${duplicateCodes.join(", ")}.`);
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

  return warnings;
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
  if (!["parsed", "reviewed", "approved"].includes(source.status)) {
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
  const warnings = validateBlueprintDraft(content);
  const suggestedSlug = suggestSlug(content.certificationName, content.examCode);

  const [draft] = await db
    .insert(blueprintDrafts)
    .values({
      sourceId,
      certificationId: source.certificationId,
      content,
      suggestedSlug,
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

/**
 * R1.2: "Slug ... editierbar lassen" - bislang die einzige vom Admin direkt
 * korrigierbare Feldkorrektur; volle Inline-Bearbeitung der extrahierten
 * Domains/Objectives ist R1.3.
 */
export async function updateBlueprintDraftSlug(
  sourceId: string,
  suggestedSlug: string,
  userId: string,
): Promise<BlueprintDraft | null> {
  const [draft] = await getDb()
    .update(blueprintDrafts)
    .set({ suggestedSlug, editedByUserId: userId, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(blueprintDrafts.sourceId, sourceId))
    .returning();
  return draft ?? null;
}
