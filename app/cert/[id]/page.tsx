"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileCheck2, PlayCircle } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { useCertificateDetail } from "@/lib/hooks/queries";
import { ModuleStatusIcon, type ModuleStatus } from "@/components/ModuleStatusIcon";

export default function CertificateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const detail = useCertificateDetail(id);

  if (detail === undefined) return null;

  const { certificate, modules } = detail;

  if (!certificate) {
    return <p className="text-foreground/70">{t.certDetail.notFound}</p>;
  }

  const firstOpenIndex = modules.findIndex((m) => !m.isCompleted);
  const activeModule = firstOpenIndex === -1 ? modules[modules.length - 1] : modules[firstOpenIndex];

  function statusFor(index: number): ModuleStatus {
    if (modules[index].isCompleted) return "completed";
    if (index === firstOpenIndex || firstOpenIndex === -1) return "active";
    return index < firstOpenIndex ? "completed" : "locked";
  }

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href="/"
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t.certDetail.back}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">{certificate.title}</h1>
      <p className="mb-6 text-sm text-foreground/70">
        {certificate.progress}% - {certificate.totalDays} {t.dashboard.day.toLowerCase()}
        {locale === "de" ? "e" : "s"}
      </p>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        {activeModule && (
          <Link
            href={`/cert/${certificate.id}/day/${activeModule.day}`}
            className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {t.certDetail.continueToday}
          </Link>
        )}
        <Link
          href={`/cert/${certificate.id}/exam`}
          className="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface"
        >
          <FileCheck2 className="h-4 w-4" aria-hidden="true" />
          {t.certDetail.startExam}
        </Link>
      </div>

      <h2 className="mb-3 text-lg font-semibold">{t.certDetail.roadmap}</h2>
      <ol className="flex flex-col gap-2">
        {modules.map((module, index) => {
          const status = statusFor(index);
          const isLocked = status === "locked";

          const content = (
            <div
              className={`flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 ${
                isLocked ? "opacity-50" : "hover:border-accent"
              }`}
            >
              <ModuleStatusIcon status={status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {t.certDetail.dayLabel} {module.day} - {module.title[locale]}
                </p>
                <p className="truncate text-xs text-foreground/60">{module.summary[locale]}</p>
              </div>
              <span className="shrink-0 text-xs text-foreground/50">
                {status === "completed"
                  ? t.certDetail.statusCompleted
                  : status === "active"
                    ? t.certDetail.statusActive
                    : t.certDetail.statusLocked}
              </span>
            </div>
          );

          return (
            <li key={module.id}>
              {isLocked ? (
                content
              ) : (
                <Link href={`/cert/${certificate.id}/day/${module.day}`}>{content}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
