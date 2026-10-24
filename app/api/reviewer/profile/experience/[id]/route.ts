import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { profileErrorResponse, uuid } from "@/lib/server/reviewers/profile-http";
import { deleteExperience, getOwnProfile, saveExperience } from "@/lib/server/reviewers/profile-service";
import { EXPERIENCE_KINDS } from "@/lib/reviewers/profile";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(EXPERIENCE_KINDS as [string, ...string[]]),
  title: z.string().max(500),
  organization: z.string().max(500).nullish(),
  periodFrom: z.string().max(20),
  periodTo: z.string().max(20).nullish(),
  description: z.string().max(3000).nullish(),
  isPublic: z.boolean(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await saveExperience(guard.user.id, schema.parse(await request.json()) as never, id);
    return NextResponse.json(await getOwnProfile(guard.user.id));
  } catch (error) {
    return profileErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return (await deleteExperience(guard.user.id, id)) ? NextResponse.json(await getOwnProfile(guard.user.id)) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return profileErrorResponse(error);
  }
}
