export const dynamic = "force-dynamic";

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
        <p className="text-foreground/70">
          {locale === "de" ? "Bitte melde dich an." : "Please sign in."}
        </p>
        <Link href="/login" className="mt-4 text-accent hover:underline">
          {locale === "de" ? "Anmelden" : "Sign in"}
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
        <p className="text-foreground/70">
          {locale === "de" ? "Remediation konnte nicht geladen werden." : "Could not load remediation."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/cert/${certSlug}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
      </Link>

      <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
        <p className="text-sm font-medium text-yellow-800">
          {locale === "de" ? "Wiederholung: " : "Review: "}
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
