"use client";

import { useEffect, useState } from "react";

/** 2-px-Linie am oberen Rand: wie weit die Seite gelesen ist (nur Anzeige, keine Auswertung). */
export function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-0.5 bg-transparent" role="progressbar" aria-hidden="true" data-testid="reading-progress">
      <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${pct}%` }} />
    </div>
  );
}
