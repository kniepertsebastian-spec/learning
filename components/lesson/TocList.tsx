"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useLocaleOptional } from "@/lib/i18n";
import type { TocEntry } from "@/lib/markdown/toc";

/** „Auf dieser Seite“: H2-Anker, der aktive Eintrag mit 2-px-Mint-Linie (IntersectionObserver). */
export function TocList({ entries }: { entries: TocEntry[] }) {
  const { t } = useLocaleOptional();
  const [active, setActive] = useState<string | null>(entries[0]?.id ?? null);
  useEffect(() => {
    if (entries.length === 0 || typeof IntersectionObserver === "undefined") return;
    const els = entries.map((e) => document.getElementById(e.id)).filter((e): e is HTMLElement => e !== null);
    const obs = new IntersectionObserver(
      (items) => {
        const visible = items.filter((i) => i.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [entries]);
  if (entries.length === 0) return null;
  return (
    <nav aria-label={t.lesson_page.onThisPage} data-testid="toc">
      <p className="mb-2 text-2xs font-semibold tracking-overline text-faint uppercase">{t.lesson_page.onThisPage}</p>
      <ul className="border-l border-border-subtle">
        {entries.map((e) => (
          <li key={e.id}>
            <a href={`#${e.id}`} aria-current={active === e.id ? "location" : undefined} className={cn("-ml-px block border-l-2 py-1.5 pl-3 text-meta", active === e.id ? "border-mint text-foreground" : "border-transparent text-subtle hover:text-foreground")}>
              {e.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
