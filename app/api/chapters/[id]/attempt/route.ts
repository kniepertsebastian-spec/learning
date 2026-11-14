import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { featuresOfDomain, isDomainHidden } from "@/lib/server/catalog/access";
import { parseAttemptBody, sectionAttemptBody } from "@/lib/server/http/attempt-body";
import { recordChapterQuizAttempt, SectionNotFoundError } from "@/lib/server/sections/attempt-service";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verbucht einen Kapitel-Quiz-Versuch (Ergebnis, Lernzielstand, Wiederholungen). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id) || (await isDomainHidden(session.user.id, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const features = await featuresOfDomain(id);
  if (features && !features.includeSectionQuizzes) return NextResponse.json({ error: "Tests sind für diesen Lernpfad ausgeschaltet." }, { status: 409 });
  const body = await parseAttemptBody(request, sectionAttemptBody);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await recordChapterQuizAttempt(session.user.id, id, body.data.answers));
  } catch (error) {
    if (error instanceof SectionNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
