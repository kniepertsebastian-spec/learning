import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { profileErrorResponse } from "@/lib/server/reviewers/profile-http";
import { getOwnProfile, saveExperience } from "@/lib/server/reviewers/profile-service";
import { EXPERIENCE_KINDS } from "@/lib/reviewers/profile";

export const dynamic = "force-dynamic";

const experienceSchema = z.object({
  kind: z.enum(EXPERIENCE_KINDS as [string, ...string[]]),
  title: z.string().max(500),
  organization: z.string().max(500).nullish(),
  periodFrom: z.string().max(20),
  periodTo: z.string().max(20).nullish(),
  description: z.string().max(3000).nullish(),
  isPublic: z.boolean(),
});

/** Erfahrungseintrag anlegen. */
export async function POST(request: Request) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  try {
    await saveExperience(guard.user.id, experienceSchema.parse(await request.json()) as never);
    return NextResponse.json(await getOwnProfile(guard.user.id), { status: 201 });
  } catch (error) {
    return profileErrorResponse(error);
  }
}
