export const dynamic = "force-dynamic";

import { c_certIdRemediationObjectiveIdPage } from "@/lib/i18n/components/certIdRemediationObjectiveIdPage";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { objectives } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { RemediationService } from "@/lib/server/remediation/service";
import { RemediationSession } from "@/components/RemediationSession";
import type { RemediationResponse } from "@/lib/server/ai/service";

type RemediationLesson = RemediationResponse["lesson"];
type RemediationQuestion = RemediationResponse["questions"][number];

export default async function RemediationPage({
  params,
}: {
  params: Promise<{ id: string; objectiveId: string }>;
}) {
  const { id: certSlug, objectiveId } = await params;
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  if (!session?.user?.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted">
          {c_certIdRemediationObjectiveIdPage(locale).pleaseSignIn}
        </p>
        <Link href="/login" className="mt-4 text-link hover:underline">
          {c_certIdRemediationObjectiveIdPage(locale).signIn}
        </Link>
      </div>
    );
  }

  const db = getDb();
  const objectiveRows = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objectiveRows.length) notFound();
  const objective = objectiveRows[0];

  let remediation: { sessionId: string; lesson: RemediationLesson; questions: RemediationQuestion[] };
  try {
    const result = await RemediationService.getOrCreateRemediationSession(
      session.user.id,
      objectiveId,
    );
    remediation = {
      sessionId: result.sessionId,
      lesson: result.lesson as RemediationLesson,
      questions: result.questions as RemediationQuestion[],
    };
  } catch (error) {
    console.error("Error loading remediation:", error);
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted">
          {c_certIdRemediationObjectiveIdPage(locale).couldNotLoadRemediation}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/cert/${certSlug}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {c_certIdRemediationObjectiveIdPage(locale).backToCertification}
      </Link>

      <div className="mb-6 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3">
        <p className="text-sm font-medium text-warning-text">
          {c_certIdRemediationObjectiveIdPage(locale).review}
          <span className="font-mono text-xs">{objective.code}</span> {objective.title}
        </p>
      </div>

      <RemediationSession
        certSlug={certSlug}
        objectiveId={objectiveId}
        sessionId={remediation.sessionId}
        lesson={remediation.lesson}
        questions={remediation.questions}
        locale={locale}
      />
    </div>
  );
}
