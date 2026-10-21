/** PSRP-HR Phase 7.4: Nutzeransicht „Selbsteinschätzung“ - nur bei belastbarer Datenlage, neutral und motivierend. */
import { eq } from "drizzle-orm";
import type { Locale } from "@/lib/types";
import { getDb } from "@/lib/server/db/client";
import { concepts, userCalibration } from "@/lib/server/db/schema";
import { classifyCalibration, OVERALL_TOPIC, type CalibrationStatus } from "./calibration";

export interface SelfAssessmentTopic {
  topicArea: string;
  status: Exclude<CalibrationStatus, "unknown">;
}

export const SELF_ASSESSMENT_TEXT: Record<Exclude<CalibrationStatus, "unknown">, Record<Locale, string>> = {
  calibrated: {
    de: "Gut kalibriert: Deine Einschätzung passt zu deinen Ergebnissen.",
    en: "Well calibrated: your confidence matches your results.",
  },
  overestimates: {
    de: "Hier lohnt sich ein zweiter Blick: Du fühlst dich sicherer, als die Ergebnisse zeigen. Wir wiederholen das Thema etwas früher.",
    en: "Worth a second look: you feel more certain than your results show. We'll bring this topic back a bit sooner.",
  },
  underestimates: {
    de: "Du kannst mehr, als du dir zutraust – vertrau deinem Wissen ruhig etwas mehr.",
    en: "You know more than you give yourself credit for – trust your knowledge a little more.",
  },
};

/** Themengebiete des Kurses mit belastbarem Kalibrierungswert (mindestens die Mindestanzahl Abfragen). */
export async function getSelfAssessment(userId: string, certificationId: string): Promise<SelfAssessmentTopic[]> {
  const db = getDb();
  const topicRows = await db.selectDistinct({ topicArea: concepts.topicArea }).from(concepts).where(eq(concepts.courseId, certificationId));
  if (topicRows.length === 0) return [];
  const rows = await db.select().from(userCalibration).where(eq(userCalibration.userId, userId));
  const inCourse = new Set(topicRows.map((t) => t.topicArea));
  return rows
    .filter((r) => r.topicArea !== OVERALL_TOPIC && inCourse.has(r.topicArea))
    .map((r) => ({ topicArea: r.topicArea, status: classifyCalibration({ bias: r.bias, ciLow: r.ciLow, ciHigh: r.ciHigh, n: r.nProbes }) }))
    .filter((t): t is SelfAssessmentTopic => t.status !== "unknown")
    .sort((a, b) => a.topicArea.localeCompare(b.topicArea));
}
