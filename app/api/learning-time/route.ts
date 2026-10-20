import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { getDb } from "@/lib/server/db/client";
import { learningTime } from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";

const schema = z.object({ certificationId: z.string().uuid(), seconds: z.number().int().min(1).max(120) });

/**
 * Aktive Lernzeit (Sekunden) zum heutigen Tag addieren. Höchstens 120 Sekunden je Meldung und 24 h je Tag, damit ein
 * kaputter oder manipulierter Client die Statistik nicht verzerrt. Kommt per sendBeacon, daher keine Antwortdaten.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const { certificationId, seconds } = parsed.data;
  if (await isCertificationHidden(session.user.id, certificationId)) return new NextResponse(null, { status: 404 });
  try {
    await getDb()
      .insert(learningTime)
    .values({ userId: session.user.id, certificationId, day: sql`(now() at time zone 'utc')::date`, seconds })
      .onConflictDoUpdate({ target: [learningTime.userId, learningTime.certificationId, learningTime.day], set: { seconds: sql`least(${learningTime.seconds} + ${seconds}, 86400)` } });
  } catch {
    return new NextResponse(null, { status: 404 }); // Kurs gibt es nicht (mehr)
  }
  return new NextResponse(null, { status: 204 });
}
