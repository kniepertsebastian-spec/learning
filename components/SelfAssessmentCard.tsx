import { Compass } from "lucide-react";
import type { Locale } from "@/lib/types";
import { SELF_ASSESSMENT_TEXT, type SelfAssessmentTopic } from "@/lib/server/psrp/self-assessment";

/** Selbsteinschätzung je Themengebiet (PSRP-HR Phase 7.4); erscheint erst, wenn die Datenlage belastbar ist. */
export function SelfAssessmentCard({ locale, topics }: { locale: Locale; topics: SelfAssessmentTopic[] }) {
  if (topics.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-5" data-testid="self-assessment">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Compass className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Selbsteinschätzung" : "Self-assessment"}
      </h2>
      <ul className="space-y-1.5 text-sm">
        {topics.map((topic) => (
          <li key={topic.topicArea}>
            <span className="font-medium">{topic.topicArea}:</span>{" "}
            <span className="text-muted">{SELF_ASSESSMENT_TEXT[topic.status][locale]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
