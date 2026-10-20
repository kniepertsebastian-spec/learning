"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import type { CourseCategoryColor } from "@/lib/server/db/schema";

const DOT: Record<CourseCategoryColor, string> = { info: "bg-info", mint: "bg-mint", warning: "bg-warning", danger: "bg-danger", violet: "bg-violet" };
const TILE: Record<CourseCategoryColor, string> = { info: "bg-info-soft text-info-text", mint: "bg-mint-soft text-mint-text", warning: "bg-warning-soft text-warning-text", danger: "bg-danger-soft text-danger-text", violet: "bg-surface-2 text-violet" };

export function CatalogView({
  certs,
  groups,
}: {
  certs: Array<{ id: string; slug: string; name: string; provider: string; version: string; shortCode: string; categoryId: string | null; categoryIds: string[]; custom: boolean; summary: { de: string; en: string } | null }>;
  groups: Array<{ id: string; name: { de: string; en: string }; color: CourseCategoryColor }>;
  signedIn: boolean;
}) {
  const { locale, t } = useLocale();
  const h = t.home;
  const [filter, setFilter] = useState("all");
  const visible = certs.filter((c) => filter === "all" || c.categoryIds.includes(filter) || (filter === "none" && c.categoryIds.length === 0));
  const ungrouped = certs.filter((c) => c.categoryIds.length === 0).length;
  const chip = (active: boolean) => cn("flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", active ? "border-foreground bg-surface-2 text-foreground" : "border-border-strong text-muted hover:text-foreground");
  return (
    <div className="flex flex-col gap-5" data-testid="catalog">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{h.catalogTitle}</h1>
        <p className="mt-1 text-sm text-subtle">{h.catalogSub}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={h.catalogTitle}>
        <button type="button" className={chip(filter === "all")} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{h.all} <span className="text-faint">{certs.length}</span></button>
        {groups.map((g) => {
          const n = certs.filter((c) => c.categoryIds.includes(g.id)).length;
          if (n === 0) return null;
          return (
            <button key={g.id} type="button" className={chip(filter === g.id)} aria-pressed={filter === g.id} onClick={() => setFilter(g.id)}>
              <span className={cn("h-2 w-2 rounded-full", DOT[g.color])} aria-hidden="true" />{g.name[locale]} <span className="text-faint">{n}</span>
            </button>
          );
        })}
        {ungrouped > 0 && groups.length > 0 && <button type="button" className={chip(filter === "none")} aria-pressed={filter === "none"} onClick={() => setFilter("none")}>{h.ungrouped} <span className="text-faint">{ungrouped}</span></button>}
      </div>
      {visible.length === 0 ? (
        <EmptyState title={h.catalogEmpty} />
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
          {visible.map((c) => {
            const g = groups.find((x) => x.id === c.categoryId);
            return (
              <li key={c.id}>
                <Card className="flex h-full flex-col gap-3" data-testid={`catalog-card-${c.slug}`}>
                  <div className="flex items-start gap-3">
                    <span className={cn("flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl font-mono text-[13px] font-semibold", g ? TILE[g.color] : "bg-surface-2 text-muted")} aria-hidden="true">{c.shortCode}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="font-mono text-[11.5px] text-subtle">{c.custom ? h.customTraining : `${c.provider} · ${c.version}`}</p>
                    </div>
                  </div>
                  {c.summary && <p className="line-clamp-3 text-[13px] text-muted" data-testid="catalog-summary">{c.summary[locale]}</p>}
                  <Button asChild size="sm" variant="secondary" className="mt-auto self-end"><Link href={`/cert/${c.slug}`}>{h.startLearning}</Link></Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
