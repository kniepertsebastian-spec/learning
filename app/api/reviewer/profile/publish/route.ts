import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { profileErrorResponse } from "@/lib/server/reviewers/profile-http";
import { getOwnProfile, publishProfile, withdrawProfile } from "@/lib/server/reviewers/profile-service";

export const dynamic = "force-dynamic";

/** Profil veröffentlichen oder sofort zurückziehen (nimmt alle Einwilligungen zurück). */
export async function POST(request: Request) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  try {
    const { action } = z.object({ action: z.enum(["publish", "withdraw"]) }).parse(await request.json());
    if (action === "publish") await publishProfile(guard.user.id);
    else await withdrawProfile(guard.user.id);
    return NextResponse.json(await getOwnProfile(guard.user.id));
  } catch (error) {
    return profileErrorResponse(error);
  }
}
