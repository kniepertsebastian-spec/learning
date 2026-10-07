import { featuresOfCertification, isCertificationHidden } from "@/lib/server/catalog/access";
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
  if (await isCertificationHidden(session.user.id, certId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const features = await featuresOfCertification(certId);
  if (features && !features.includeFinalExam) {
    return NextResponse.json({ error: "Für diesen Lernpfad gibt es keine Abschlussprüfung." }, { status: 409 });
  }

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

    // Generate exam - question count comes from the certification's real
    // exam format when known (buildExamBlueprint), falling back to a generic
    // default otherwise.
    const examData = await generateFinalExam(certId, session.user.id);

    return NextResponse.json({
      examId: examData.examId,
      totalQuestions: examData.totalQuestions,
      blueprint: examData.blueprint,
    });
  } catch (error) {
    // Erwarteter, nutzerrelevanter Fall: noch keine freigegebenen Fragen.
    if (error instanceof Error && error.message === "No questions available for exam") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // Alles andere: Details nur ins Log, nicht an den Client.
    console.error("Error generating exam:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
