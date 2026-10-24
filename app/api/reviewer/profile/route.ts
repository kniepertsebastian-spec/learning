import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { profileErrorResponse } from "@/lib/server/reviewers/profile-http";
import { getOwnProfile, saveProfile } from "@/lib/server/reviewers/profile-service";
import { PROFILE_FIELDS } from "@/lib/reviewers/profile";

export const dynamic = "force-dynamic";

const schema = z.object({
  firstName: z.string().max(200),
  lastName: z.string().max(200),
  country: z.string().max(200),
  region: z.string().max(200).nullish(),
  bio: z.object({ de: z.string().max(5000).optional(), en: z.string().max(5000).optional() }).nullish(),
  linkedinUrl: z.string().max(1000).nullish(),
  consent: z.object(Object.fromEntries(PROFILE_FIELDS.map((f) => [f, z.boolean().optional()]))),
});

/** Eigenes Expertenprofil lesen (mit Einträgen) oder speichern. */
export async function GET() {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  return NextResponse.json(await getOwnProfile(guard.user.id));
}

export async function PUT(request: Request) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  try {
    await saveProfile(guard.user.id, schema.parse(await request.json()));
    return NextResponse.json(await getOwnProfile(guard.user.id));
  } catch (error) {
    return profileErrorResponse(error);
  }
}
