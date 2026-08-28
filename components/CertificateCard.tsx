"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { useNextModule } from "@/lib/hooks/queries";
import type { Certificate } from "@/lib/types";

export function CertificateCard({ certificate }: { certificate: Certificate }) {
  const { locale, t } = useLocale();
  const nextModule = useNextModule(certificate.id);

  return (
    <Link
      href={`/cert/${certificate.id}`}
      className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent"
    >
      <h3 className="mb-2 font-semibold">{certificate.title}</h3>

      <div className="mb-1 flex items-center justify-between text-xs text-foreground/70">
        <span>{t.dashboard.progress}</span>
        <span>{certificate.progress}%</span>
      </div>
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${certificate.progress}%` }}
        />
      </div>

      <p className="text-sm text-foreground/80">
        {nextModule ? (
          <>
            {t.dashboard.nextLesson}: {t.dashboard.day} {nextModule.day} {t.dashboard.of}{" "}
            {certificate.totalDays} - {nextModule.title[locale]}
          </>
        ) : (
          t.dashboard.allDone
        )}
      </p>
    </Link>
  );
}
