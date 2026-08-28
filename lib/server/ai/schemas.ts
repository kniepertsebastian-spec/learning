import { z } from "zod";
import { localizedStringSchema } from "@/lib/ai/schemas";

/**
 * Struktur für einen KI-Entwurf von Objectives + Sections EINER Domain
 * (roadmap2.md Dev-Order Schritt 3-5). Objective-Code/Titel/Beschreibung bleiben
 * bewusst einsprachig (Englisch) - das ist Referenzdaten-Fachsprache aus dem
 * offiziellen Exam, keine lernerseitige Prosa. Section-Titel sind bilingual wie
 * der Rest der lernerseitigen Inhalte.
 *
 * WICHTIG: Dies ist ein KI-Entwurf, KEINE offiziellen CompTIA-Objectives -
 * siehe roadmap2.md Phase 2/28 und den offenen Follow-up in Schritt 1 des
 * Trackers. certifications.lastVerifiedDate bleibt entsprechend NULL, bis ein
 * echter Abgleich mit dem offiziellen Dokument stattgefunden hat.
 */
export const draftSectionSchema = z.object({
  title: localizedStringSchema,
  estimatedMinutes: z.number().int().min(5).max(120),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
});

export const draftObjectiveSchema = z.object({
  /** Objective-Code im Stil der offiziellen Objectives, z. B. "1.2". */
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  sections: z.array(draftSectionSchema).min(1).max(6),
});

export const curriculumDraftForDomainResponseSchema = z.object({
  objectives: z.array(draftObjectiveSchema).min(1).max(10),
});
