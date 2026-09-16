"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

type ReportReason = "incorrect" | "unclear" | "outdated";

const REASON_LABEL: Record<ReportReason, { de: string; en: string }> = {
  incorrect: { de: "Falsch", en: "Incorrect" },
  unclear: { de: "Unklar", en: "Unclear" },
  outdated: { de: "Veraltet", en: "Outdated" },
};

interface OpenQuestionReport {
  id: string;
  reason: ReportReason;
  createdAt: string;
  questionId: string;
  humanId: string;
  question: Record<"de" | "en", string>;
}

/**
 * R6 (roadmap.md): "Review-Queue" für gemeldete Inhalte - ersetzt die
 * frühere rein statische "Content Review Workflow"-Infobox mit einer
 * tatsächlich funktionierenden Liste offener Meldungen samt Aktionen.
 */
export function ContentReportQueue({ certificationId, locale }: { certificationId: string; locale: "de" | "en" }) {
  const [reports, setReports] = useState<OpenQuestionReport[] | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`/api/admin/certifications/${certificationId}/content-reports`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const data = (await response.json()) as { reports: OpenQuestionReport[] };
        setReports(data.reports);
      } catch {
        setReports([]);
      }
    })();
  }, [certificationId]);

  async function handleResolve(reportId: string, status: "resolved" | "dismissed") {
    if (resolving !== null) return;
    setResolving(reportId);
    try {
      const response = await fetch(`/api/admin/content-reports/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      setReports((current) => (current ?? []).filter((r) => r.id !== reportId));
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 font-medium">
        {locale === "de" ? "Gemeldete Fragen" : "Reported questions"}
      </h3>
      {reports === null ? (
        <p className="text-sm text-foreground/60">{locale === "de" ? "Lädt …" : "Loading …"}</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-foreground/60">
          {locale === "de" ? "Keine offenen Meldungen." : "No open reports."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id} className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-500">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {REASON_LABEL[report.reason][locale]}
                </span>
                <span className="font-mono text-xs text-foreground/40">{report.humanId}</span>
              </div>
              <p className="mb-2 text-sm">{report.question[locale]}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleResolve(report.id, "resolved")}
                  disabled={resolving !== null}
                  className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {locale === "de" ? "Erledigt" : "Resolved"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleResolve(report.id, "dismissed")}
                  disabled={resolving !== null}
                  className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  {locale === "de" ? "Verwerfen" : "Dismiss"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
