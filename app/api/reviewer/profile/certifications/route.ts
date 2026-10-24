import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { profileErrorResponse } from "@/lib/server/reviewers/profile-http";
import { getOwnProfile, saveCertification } from "@/lib/server/reviewers/profile-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  vendor: z.string().max(500),
  name: z.string().max(500),
  earnedOn: z.string().max(20),
  validUntil: z.string().max(20).nullish(),
  verificationUrl: z.string().max(1000),
  isPublic: z.boolean(),
});

/** Zertifikat mit Nachweis-Link anlegen (der Link wird später von einem Admin geprüft). */
export async function POST(request: Request) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  try {
    await saveCertification(guard.user.id, schema.parse(await request.json()));
    return NextResponse.json(await getOwnProfile(guard.user.id), { status: 201 });
  } catch (error) {
    return profileErrorResponse(error);
  }
}
