import { db } from "@/lib/db";
import type { ExamResult, Localized, QuizQuestion } from "@/lib/types";

function emptyLocalized(): Localized<string> {
  return { de: "", en: "" };
}

export interface NewCertificateInput {
  title: string;
  totalDays: number;
  targetDate?: string | null;
}

export interface NewModuleInput {
  day: number;
  title: Localized<string>;
  summary: Localized<string>;
}

/** Legt ein Zertifikat samt generiertem Lehrplan (Tagesmodulen) an. */
export async function createCertificateWithCurriculum(
  certData: NewCertificateInput,
  modules: NewModuleInput[],
): Promise<string> {
  const certId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction("rw", db.certificates, db.modules, async () => {
    await db.certificates.add({
      id: certId,
      title: certData.title,
      totalDays: certData.totalDays,
      targetDate: certData.targetDate ?? null,
      createdAt: now,
      progress: 0,
    });

    await db.modules.bulkAdd(
      modules.map((m) => ({
        id: crypto.randomUUID(),
        certId,
        day: m.day,
        title: m.title,
        summary: m.summary,
        isCompleted: false,
        contentMarkdown: emptyLocalized(),
      })),
    );
  });

  return certId;
}

/** Speichert generierten Lerninhalt (DE+EN) und das zugehörige Tagesquiz für ein Modul. */
export async function saveModuleContent(
  moduleId: string,
  markdown: Localized<string>,
  quizData: { questions: QuizQuestion[] },
): Promise<void> {
  const mod = await db.modules.get(moduleId);
  if (!mod) throw new Error(`Module ${moduleId} not found`);

  await db.transaction("rw", db.modules, db.quizzes, async () => {
    await db.modules.update(moduleId, { contentMarkdown: markdown });

    const existing = await db.quizzes.where({ moduleId }).first();
    if (existing) {
      await db.quizzes.update(existing.id, { questions: quizData.questions });
    } else {
      await db.quizzes.add({
        id: crypto.randomUUID(),
        certId: mod.certId,
        moduleId,
        questions: quizData.questions,
        score: null,
        completedAt: null,
      });
    }
  });
}

async function recalculateCertificateProgress(certId: string): Promise<void> {
  const modules = await db.modules.where({ certId }).toArray();
  if (modules.length === 0) return;
  const completed = modules.filter((m) => m.isCompleted).length;
  const progress = Math.round((completed / modules.length) * 100);
  await db.certificates.update(certId, { progress });
}

/** Markiert ein Modul als abgeschlossen und speichert das Quiz-Ergebnis. */
export async function markModuleCompleted(moduleId: string, score: number): Promise<void> {
  const mod = await db.modules.get(moduleId);
  if (!mod) throw new Error(`Module ${moduleId} not found`);

  await db.transaction("rw", db.modules, db.quizzes, db.certificates, async () => {
    await db.modules.update(moduleId, { isCompleted: true });

    const quiz = await db.quizzes.where({ moduleId }).first();
    if (quiz) {
      await db.quizzes.update(quiz.id, { score, completedAt: new Date().toISOString() });
    }

    await recalculateCertificateProgress(mod.certId);
  });
}

/** Speichert das Ergebnis einer simulierten Probeprüfung. */
export async function saveExamResult(certId: string, examData: ExamResult): Promise<string> {
  const id = crypto.randomUUID();
  await db.mockExams.add({
    id,
    certId,
    questions: examData.questions,
    score: examData.score,
    passed: examData.passed,
    completedAt: new Date().toISOString(),
    durationSeconds: examData.durationSeconds,
  });
  return id;
}
