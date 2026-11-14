import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { isSectionHidden } from "@/lib/server/catalog/access";
import { getDb } from "@/lib/server/db/client";
import { lessonReadingTime } from "@/lib/server/db/schema";
import { isFeatureEnabled } from "@/lib/server/feature-flags";

export const dynamic = "force-dynamic";

const schema = z.object({
  sectionId: z.string().uuid(),
  /** Aktive Lesesekunden seit der letzten Meldung; 0 ist erlaubt, wenn nur das Öffnen gemeldet wird. */
  seconds: z.number().int().min(0).max(120),
  /** Die Lektion wurde (erneut) geöffnet. */
  opened: z.boolean().optional(),
});

/**
 * Lesezeit je Lektion (Aufgabe 16, Faktor 4.9, Flag `reading_time`): addiert aktive Sekunden und zählt das Öffnen. Höchstens 120
 * Sekunden je Meldung und 24 h je Lektion, wie bei `/api/learning-time`. Kommt per sendBeacon, daher keine Antwortdaten. Ist das
 * Flag für die Person aus, wird nichts gespeichert (204 wie sonst, damit der Client nichts erneut sendet).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const { sectionId, seconds, opened } = parsed.data;
  if (!isFeatureEnabled("reading_time", session.user.id)) return new NextResponse(null, { status: 204 });
  if (await isSectionHidden(session.user.id, sectionId)) return new NextResponse(null, { status: 404 });
  const opens = opened ? 1 : 0;
  try {
    await getDb()
      .insert(lessonReadingTime)
      .values({ userId: session.user.id, sectionId, seconds, opens })
      .onConflictDoUpdate({
        target: [lessonReadingTime.userId, lessonReadingTime.sectionId],
        set: { seconds: sql`least(${lessonReadingTime.seconds} + ${seconds}, 86400)`, opens: sql`${lessonReadingTime.opens} + ${opens}`, updatedAt: sql`now()` },
      });
  } catch {
    return new NextResponse(null, { status: 404 }); // Lektion gibt es nicht (mehr)
  }
  return new NextResponse(null, { status: 204 });
}
