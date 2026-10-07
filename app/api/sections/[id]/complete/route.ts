import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { isSectionHidden } from "@/lib/server/catalog/access";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { lessonCompletions, sections } from "@/lib/server/db/schema";
import { syncAssignmentsForSection } from "@/lib/server/assignments/sync";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Markiert eine Lektion als durchgearbeitet (für Lernpfade ohne Lektionstests: der Abschluss ist das Durcharbeiten
 * aller Lektionen). Wiederholen frischt nur den Zeitpunkt auf. Gesperrte oder unbekannte Lektionen: 404.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: sectionId } = await params;
  if (!UUID.test(sectionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (await isSectionHidden(session.user.id, sectionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  const [section] = await db.select({ id: sections.id }).from(sections).where(eq(sections.id, sectionId)).limit(1);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Erneutes Markieren (z. B. in einer neuen Runde einer Pflichtschulung) setzt den Zeitpunkt neu.
  await db
    .insert(lessonCompletions)
    .values({ userId: session.user.id, sectionId })
    .onConflictDoUpdate({ target: [lessonCompletions.userId, lessonCompletions.sectionId], set: { completedAt: new Date() } });
  await syncAssignmentsForSection(session.user.id, sectionId);
  return NextResponse.json({ ok: true });
}
