import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { ContentValidationService } from "@/lib/server/admin/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: Add admin role check
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

    // Run validation
    const validationResult = await ContentValidationService.validateCertificationContent(certId);

    return NextResponse.json(validationResult);
  } catch (error) {
    console.error("Error validating certification content:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
