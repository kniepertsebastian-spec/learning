import { spawn } from "node:child_process";
import { and, desc, eq, inArray } from "drizzle-orm";
import { CURRICULUM_MODEL, LESSONS_MODEL } from "@/lib/claude";
import { getDb } from "@/lib/server/db/client";
import {
  contentGenerationJobs,
  domains,
  lessons,
  objectives,
  questions,
  sections,
  type GenerationErrorClass,
} from "@/lib/server/db/schema";

export type ContentGenerationJob = typeof contentGenerationJobs.$inferSelect;

const globalForJobs = globalThis as unknown as {
  contentGenerationProcesses?: Map<string, Promise<void>>;
};
const activeJobs =
  globalForJobs.contentGenerationProcesses ?? new Map<string, Promise<void>>();
globalForJobs.contentGenerationProcesses = activeJobs;

function truncate(value: string, maxLength = 4_000): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

/** Passend zur USAGE-Zeile aus lib/ai/generate.ts's requestJson(). */
const USAGE_LINE_PATTERN =
  /^USAGE model=(\S+) promptTokens=(\d+) completionTokens=(\d+) totalTokens=(\d+)$/;

export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  model: string,
): number | null {
  let pricePerMillionPrompt = 0;
  let pricePerMillionCompletion = 0;

  if (model === CURRICULUM_MODEL) {
    pricePerMillionPrompt =
      Number(
        process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD ||
          process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD,
      ) || 0;
    pricePerMillionCompletion =
      Number(
        process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD ||
          process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD,
      ) || 0;
  } else if (model === LESSONS_MODEL) {
    pricePerMillionPrompt =
      Number(
        process.env.GEMINI_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD ||
          process.env.ANTHROPIC_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD,
      ) || 0;
    pricePerMillionCompletion =
      Number(
        process.env.GEMINI_LESSONS_PRICE_PER_MILLION_COMPLETION_TOKENS_USD ||
          process.env.ANTHROPIC_LESSONS_PRICE_PER_MILLION_COMPLETION_TOKENS_USD,
      ) || 0;
  } else {
    return null;
  }

  if (pricePerMillionPrompt === 0 && pricePerMillionCompletion === 0) return null;
  return (
    (promptTokens / 1_000_000) * pricePerMillionPrompt +
    (completionTokens / 1_000_000) * pricePerMillionCompletion
  );
}

export interface AiBudgetStatus {
  limitUsd: number;
  spentUsd: number;
  exceeded: boolean;
}

export async function getAiBudgetStatus(): Promise<AiBudgetStatus | null> {
  const limitUsd = Number(process.env.GEMINI_BUDGET_USD || process.env.ANTHROPIC_BUDGET_USD) || 0;
  if (limitUsd <= 0) return null;

  const rows = await getDb()
    .select({ estimatedCostUsd: contentGenerationJobs.estimatedCostUsd })
    .from(contentGenerationJobs);
  const spentUsd = rows.reduce((sum, row) => sum + Number(row.estimatedCostUsd ?? 0), 0);

  return { limitUsd, spentUsd, exceeded: spentUsd >= limitUsd };
}

async function updateJob(
  jobId: string,
  values: Partial<typeof contentGenerationJobs.$inferInsert>,
): Promise<void> {
  await getDb()
    .update(contentGenerationJobs)
    .set(values)
    .where(eq(contentGenerationJobs.id, jobId));
}

function runNpmScript(
  script: string,
  slug: string,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script, "--", slug], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let lineBuffer = "";
    let outputTail = "";
    const consume = (chunk: Buffer, isError = false) => {
      const text = chunk.toString();
      outputTail = truncate(`${outputTail}${text}`, 12_000);
      if (isError) process.stderr.write(text);
      else process.stdout.write(text);

      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onLine(line.trim());
      }
    };

    child.stdout.on("data", (chunk: Buffer) => consume(chunk));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, true));
    child.on("error", reject);
    child.on("close", (code) => {
      if (lineBuffer.trim()) onLine(lineBuffer.trim());
      if (code === 0) resolve();
      else reject(new Error(`${script} wurde mit Exit-Code ${code ?? "unbekannt"} beendet.\n${outputTail}`));
    });
  });
}

async function executeJob(jobId: string, certificationId: string, slug: string) {
  const db = getDb();
  let updateQueue = Promise.resolve();
  const queueUpdate = (values: Partial<typeof contentGenerationJobs.$inferInsert>) => {
    updateQueue = updateQueue
      .then(() => updateJob(jobId, values))
      .catch((error) => console.error("Content job progress update failed:", error));
  };

  const modelsSeen = new Set<string>();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsdSum = 0;
  let anyCostKnown = false;

  function trackUsageLine(line: string): Partial<typeof contentGenerationJobs.$inferInsert> | null {
    const match = USAGE_LINE_PATTERN.exec(line);
    if (!match) return null;
    const [, model, linePromptTokensRaw, lineCompletionTokensRaw] = match;
    modelsSeen.add(model);
    const linePromptTokens = Number(linePromptTokensRaw);
    const lineCompletionTokens = Number(lineCompletionTokensRaw);
    promptTokens += linePromptTokens;
    completionTokens += lineCompletionTokens;
    totalTokens += linePromptTokens + lineCompletionTokens;

    const lineCostUsd = estimateCostUsd(linePromptTokens, lineCompletionTokens, model);
    if (lineCostUsd !== null) {
      estimatedCostUsdSum += lineCostUsd;
      anyCostKnown = true;
    }

    return {
      model: Array.from(modelsSeen).join(", "),
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: anyCostKnown ? estimatedCostUsdSum.toString() : null,
    };
  }

  await updateJob(jobId, {
    status: "running",
    phase: "curriculum",
    progress: 2,
    message: "Curriculum wird vorbereitet …",
    startedAt: new Date(),
    error: null,
  });

  const certDomains = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.certificationId, certificationId));
  const totalDomains = Math.max(certDomains.length, 1);
  let completedDomains = 0;

  await runNpmScript("content:draft-curriculum", slug, (line) => {
    const usageValues = trackUsageLine(line);
    if (/^Domain \d+ .*(: hat bereits Objectives|Sections gespeichert)/.test(line)) {
      completedDomains++;
    }
    queueUpdate({
      phase: "curriculum",
      progress: Math.min(42, 5 + Math.round((completedDomains / totalDomains) * 37)),
      message: truncate(line, 500),
      ...usageValues,
    });
  });
  await updateQueue;

  const certObjectives =
    certDomains.length > 0
      ? await db
          .select({ id: objectives.id })
          .from(objectives)
          .where(inArray(objectives.domainId, certDomains.map((domain) => domain.id)))
      : [];
  const totalObjectives = Math.max(certObjectives.length, 1);
  let completedObjectives = 0;

  await updateJob(jobId, {
    phase: "lessons",
    progress: 45,
    message: "Lektionen und Fragen werden erzeugt …",
  });

  await runNpmScript("content:draft-lessons", slug, (line) => {
    const usageValues = trackUsageLine(line);
    if (/^Objective .*(: bereits vorhanden|Fragen gespeichert)/.test(line)) {
      completedObjectives++;
    }
    queueUpdate({
      phase: "lessons",
      progress: Math.min(97, 45 + Math.round((completedObjectives / totalObjectives) * 52)),
      message: truncate(line, 500),
      ...usageValues,
    });
  });
  await updateQueue;

  await updateJob(jobId, {
    status: "succeeded",
    phase: "complete",
    progress: 100,
    message: "Curriculum, Lektionen und Fragen sind bereit.",
    completedAt: new Date(),
  });
}

export function classifyGenerationError(outputTail: string): GenerationErrorClass {
  if (
    /RESOURCE_EXHAUSTED|rate_limit|rate_limit_error/i.test(outputTail) &&
    /per\s?day|daily quota|tokens per day|quota/i.test(outputTail)
  ) {
    return "quota";
  }
  if (/RESOURCE_EXHAUSTED|rate_limit|rate_limit_error/i.test(outputTail)) {
    return "rate_limit";
  }
  if (
    /entspricht nicht dem erwarteten Schema|konnte nicht als JSON geparst werden|invalid_request_error|failed to parse structured output/i.test(
      outputTail,
    )
  ) {
    return "schema";
  }
  if (
    /overloaded_error|api_error|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(
      outputTail,
    )
  ) {
    return "provider_outage";
  }
  return "internal";
}

export function startContentGenerationJob(
  jobId: string,
  certificationId: string,
  slug: string,
): void {
  if (activeJobs.has(jobId)) return;

  const processPromise = executeJob(jobId, certificationId, slug)
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Content generation job failed:", error);
      await updateJob(jobId, {
        status: "failed",
        phase: "failed",
        message: "Inhaltsgenerierung fehlgeschlagen.",
        error: truncate(message),
        errorClass: classifyGenerationError(message),
        completedAt: new Date(),
      });
    })
    .finally(() => activeJobs.delete(jobId));

  activeJobs.set(jobId, processPromise);
}

export async function getLatestContentGenerationJob(
  certificationId: string,
): Promise<ContentGenerationJob | null> {
  const [job] = await getDb()
    .select()
    .from(contentGenerationJobs)
    .where(eq(contentGenerationJobs.certificationId, certificationId))
    .orderBy(desc(contentGenerationJobs.createdAt))
    .limit(1);

  if (!job) return null;
  if (
    (job.status === "queued" || job.status === "running") &&
    !activeJobs.has(job.id)
  ) {
    await updateJob(job.id, {
      status: "failed",
      phase: "interrupted",
      message: "Der App-Container wurde während der Generierung neu gestartet.",
      error: "Job unterbrochen. Starte die Generierung erneut; vorhandene Inhalte werden übersprungen.",
      completedAt: new Date(),
    });
    return {
      ...job,
      status: "failed",
      phase: "interrupted",
      message: "Der App-Container wurde während der Generierung neu gestartet.",
      error: "Job unterbrochen. Starte die Generierung erneut; vorhandene Inhalte werden übersprungen.",
      completedAt: new Date(),
    };
  }

  return job;
}

export interface GenerationEstimate {
  domainsPending: number;
  objectivesPending: number;
  estimatedAiCalls: number;
  missingObjectiveCodes: string[];
}

export async function estimateGenerationWork(
  certificationId: string,
): Promise<GenerationEstimate> {
  const db = getDb();

  const certDomains = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.certificationId, certificationId));
  const domainIds = certDomains.map((domain) => domain.id);

  const certObjectives = domainIds.length
    ? await db
        .select({ id: objectives.id, code: objectives.code, domainId: objectives.domainId })
        .from(objectives)
        .where(inArray(objectives.domainId, domainIds))
    : [];
  const domainsWithObjectives = new Set(certObjectives.map((objective) => objective.domainId));
  const domainsPending = domainIds.filter((id) => !domainsWithObjectives.has(id)).length;

  const objectiveIds = certObjectives.map((objective) => objective.id);
  const objectiveSections = objectiveIds.length
    ? await db
        .select({ id: sections.id, objectiveId: sections.objectiveId })
        .from(sections)
        .where(inArray(sections.objectiveId, objectiveIds))
    : [];
  const sectionIds = objectiveSections.map((section) => section.id);

  const lessonRows = sectionIds.length
    ? await db
        .select({ sectionId: lessons.sectionId })
        .from(lessons)
        .where(inArray(lessons.sectionId, sectionIds))
    : [];
  const sectionsWithLesson = new Set(lessonRows.map((lesson) => lesson.sectionId));

  const questionRows = objectiveIds.length
    ? await db
        .select({ objectiveId: questions.objectiveId })
        .from(questions)
        .where(inArray(questions.objectiveId, objectiveIds))
    : [];
  const questionCountByObjective = new Map<string, number>();
  for (const row of questionRows) {
    questionCountByObjective.set(
      row.objectiveId,
      (questionCountByObjective.get(row.objectiveId) ?? 0) + 1,
    );
  }

  const sectionIdsByObjective = new Map<string, string[]>();
  for (const section of objectiveSections) {
    const list = sectionIdsByObjective.get(section.objectiveId) ?? [];
    list.push(section.id);
    sectionIdsByObjective.set(section.objectiveId, list);
  }

  const missingObjectiveCodes = certObjectives
    .filter((objective) => {
      const objSectionIds = sectionIdsByObjective.get(objective.id) ?? [];
      const allSectionsHaveLesson =
        objSectionIds.length > 0 && objSectionIds.every((id) => sectionsWithLesson.has(id));
      const hasEnoughQuestions = (questionCountByObjective.get(objective.id) ?? 0) >= 5;
      return !allSectionsHaveLesson || !hasEnoughQuestions;
    })
    .map((objective) => objective.code);

  return {
    domainsPending,
    objectivesPending: missingObjectiveCodes.length,
    estimatedAiCalls: domainsPending + missingObjectiveCodes.length,
    missingObjectiveCodes,
  };
}

export async function findActiveContentGenerationJob(
  certificationId: string,
): Promise<ContentGenerationJob | null> {
  const [job] = await getDb()
    .select()
    .from(contentGenerationJobs)
    .where(
      and(
        eq(contentGenerationJobs.certificationId, certificationId),
        inArray(contentGenerationJobs.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(contentGenerationJobs.createdAt))
    .limit(1);
  return job ?? null;
}
