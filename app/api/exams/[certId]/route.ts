import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { generateFinalExam } from "@/lib/server/exam/generator";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId } = await params;
  const db = getDb();

  try {
    // Verify certification exists
    const cert = await db
      .select()
      .from(certifications)
      .where(eq(certifications.id, certId))
      .limit(1);

    if (!cert.length) {
      return NextResponse.json({ error: "Certification not found" }, { status: 404 });
    }

    // Generate exam
    const examData = await generateFinalExam(certId, session.user.id, 90);

    return NextResponse.json({
      examId: examData.examId,
      totalQuestions: examData.totalQuestions,
      blueprint: examData.blueprint,
    });
  } catch (error) {
    console.error("Error generating exam:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
