"use client";

import { ArrowLeft, House } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { homePathForContext, parentPath, type ShellContext } from "@/lib/shell/nav";

/**
 * Sichtbarer Weg zurück: „Zurück“ zur Seite darüber (bei Kurs-Unterseiten „Zurück zum Kurs“) und „Dashboard“. Steht auf jeder
 * Seite außer der Startseite des Kontexts, in der Leiste oben, damit man nicht in der Seitenleiste suchen muss.
 */
export function BackBar({ pathname, ctx }: { pathname: string; ctx: ShellContext }) {
  const { t } = useLocale();
  const home = homePathForContext(ctx);
  if (pathname === home || pathname === `${home}/`) return null;
  const parent = parentPath(pathname);
  const toCourse = /^\/cert\/[^/]+$/.test(parent);
  const homeLabel = ctx === "company" ? t.shell.toCompanyHome : ctx === "admin" ? t.shell.toAdminHome : t.shell.toDashboard;
  const btn = "inline-flex h-10 items-center gap-1.5 rounded-md border border-border-strong bg-control px-3 text-sm font-medium hover:bg-surface-2";
  return (
    <nav aria-label={t.shell.back} className="flex flex-wrap items-center gap-2" data-testid="back-bar">
      <Link href={parent} className={btn} data-testid="back-link">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {toCourse ? t.shell.backToCourse : t.shell.back}
      </Link>
      {parent !== home && (
        <Link href={home} className={btn} data-testid="home-link">
          <House className="h-4 w-4" aria-hidden="true" />
          {homeLabel}
        </Link>
      )}
    </nav>
  );
}
