import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import {
  recordSectionQuizAttempt,
  SectionNotFoundError,
  type SectionQuizAnswerInput,
} from "@/lib/server/sections/attempt-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sectionId } = await params;
  const body = (await request.json()) as { answers: SectionQuizAnswerInput[] };

  try {
    const result = await recordSectionQuizAttempt(session.user.id, sectionId, body.answers);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SectionNotFoundError) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }
    throw error;
  }
}
