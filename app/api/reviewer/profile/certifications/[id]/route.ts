import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { profileErrorResponse, uuid } from "@/lib/server/reviewers/profile-http";
import { deleteCertification, getOwnProfile, saveCertification } from "@/lib/server/reviewers/profile-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  vendor: z.string().max(500),
  name: z.string().max(500),
  earnedOn: z.string().max(20),
  validUntil: z.string().max(20).nullish(),
  verificationUrl: z.string().max(1000),
  isPublic: z.boolean(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await saveCertification(guard.user.id, schema.parse(await request.json()), id);
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
    return (await deleteCertification(guard.user.id, id)) ? NextResponse.json(await getOwnProfile(guard.user.id)) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return profileErrorResponse(error);
  }
}
