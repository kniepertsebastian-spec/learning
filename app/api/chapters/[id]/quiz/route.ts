import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { featuresOfDomain, isDomainHidden } from "@/lib/server/catalog/access";
import { drawChapterQuiz } from "@/lib/server/chapters/service";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Zieht ein neues Kapitel-Quiz: 10 zufällige Fragen aus dem Pool des Kapitels (bei Wiederholung möglichst neue). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id) || (await isDomainHidden(session.user.id, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const features = await featuresOfDomain(id);
  if (features && !features.includeSectionQuizzes) return NextResponse.json({ error: "Tests sind für diesen Lernpfad ausgeschaltet." }, { status: 409 });
  const draw = await drawChapterQuiz(session.user.id, id);
  if (!draw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(draw);
}
