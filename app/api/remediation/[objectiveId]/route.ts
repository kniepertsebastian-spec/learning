import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import {
  RemediationRateLimitError,
  RemediationService,
} from "@/lib/server/remediation/service";

type RouteContext = { params: Promise<{ objectiveId: string }> };

async function respond(forceRegenerate: boolean, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { objectiveId } = await params;

  try {
    const result = await RemediationService.getOrCreateRemediationSession(
      session.user.id,
      objectiveId,
      { forceRegenerate },
    );

    return NextResponse.json({
      sessionId: result.sessionId,
      objectiveId,
      lesson: result.lesson,
      questions: result.questions,
    });
  } catch (error) {
    if (error instanceof RemediationRateLimitError) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof Error && error.message === "Objective not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Details nur ins Log, nicht an den Client.
    console.error("Error generating remediation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Liest die vorhandene Remediation oder erzeugt sie einmalig (kein Neu-Erzeugen per Query-Parameter). */
export async function GET(_request: Request, context: RouteContext) {
  return respond(false, context);
}

/** Erzeugt ausdrücklich eine neue Remediation (Abklingzeit und Tageskontingent greifen). */
export async function POST(_request: Request, context: RouteContext) {
  return respond(true, context);
}
