import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { getDb } from "@/lib/server/db/client";
import { learningActivities } from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ kind: z.enum(["cheat_sheet"]), certificationId: z.string().uuid() });

/** POST /api/learning-activity - Spickzettel durchgesehen: zählt nicht als Review, aber als Aktivität für das Wochenziel (höchstens eine je Kurs und Stunde). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const userId = session.user.id;
  if (await isCertificationHidden(userId, parsed.data.certificationId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = getDb();
  const [recent] = await db
    .select({ id: learningActivities.id })
    .from(learningActivities)
    .where(and(eq(learningActivities.userId, userId), eq(learningActivities.kind, parsed.data.kind), eq(learningActivities.certificationId, parsed.data.certificationId), gte(learningActivities.createdAt, new Date(Date.now() - 3_600_000))))
    .limit(1);
  if (!recent) await db.insert(learningActivities).values({ userId, kind: parsed.data.kind, certificationId: parsed.data.certificationId });
  return NextResponse.json({ ok: true }, { status: 201 });
}
