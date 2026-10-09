export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { ExamPlanner } from "@/components/exams/ExamPlanner";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { visibleCertificationsCondition } from "@/lib/server/catalog/visibility";
import { getPlannerOverview } from "@/lib/server/exams/planner";

/** Prüfungsplaner: Termine, Lernplan, Bereitschaft. Gehört der Person; die Firma sieht davon nichts. */
export default async function ExamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=%2Fexams");
  const viewer = { id: user.id, role: user.role };
  const data = await getPlannerOverview(viewer, await visibleCertificationsCondition(viewer));
  return <ExamPlanner data={data} />;
}
