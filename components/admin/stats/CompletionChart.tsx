"use client";

import * as React from "react";
import type { Granularity, Period } from "@/lib/server/stats/report";

type Series = { key: "final_exam_passed" | "certified"; label: string; color: string };

/** Saubere Achsenwerte (1-2-5-Schritte) bis mindestens `max`. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export function periodLabel(start: string, g: Granularity, locale: "de" | "en"): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (g === "year") return String(d.getUTCFullYear());
  if (g === "month") return d.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/**
 * Abschlüsse je Zeitraum als gruppierte Säulen (Abschlussprüfung bestanden, Zertifikat), eine Achse, Legende oben,
 * Tooltip je Zeitraum, Tabellenansicht darunter. Farben: --chart-1/--chart-2 (validiert für hell und dunkel).
 */
export function CompletionChart({ periods, granularity, locale, title }: { periods: Period[]; granularity: Granularity; locale: "de" | "en"; title: string }) {
  const de = locale === "de";
  const series: Series[] = [
    { key: "final_exam_passed", label: de ? "Abschlussprüfung bestanden" : "Final exam passed", color: "var(--chart-1)" },
    { key: "certified", label: de ? "Zertifikat ausgestellt" : "Certificate issued", color: "var(--chart-2)" },
  ];
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(720);
  const [hover, setHover] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 240;
  const pad = { top: 12, right: 8, bottom: 28, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(0, ...periods.flatMap((p) => [p.final_exam_passed, p.certified]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const band = innerW / Math.max(1, periods.length);
  const barW = Math.max(2, Math.min(24, (band - 6) / 2 - 1));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(periods.length / Math.floor(innerW / 56)));
  const total = periods.reduce((s, p) => s + p.final_exam_passed + p.certified, 0);

  /** Säule mit 4px runder Oberkante, gerade an der Grundlinie. */
  const bar = (x: number, v: number) => {
    const h = (v / top) * innerH;
    if (h <= 0) return "";
    const r = Math.min(4, h, barW / 2);
    const yb = pad.top + innerH;
    return `M${x},${yb}V${yb - h + r}Q${x},${yb - h} ${x + r},${yb - h}H${x + barW - r}Q${x + barW},${yb - h} ${x + barW},${yb - h + r}V${yb}Z`;
  };

  const tip = hover !== null ? periods[hover] : null;
  return (
    <figure className="flex flex-col gap-3" data-testid="completion-chart">
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="font-semibold">{title}</span>
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-subtle">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </figcaption>
      <div ref={ref} className="relative w-full">
        {total === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-subtle">{de ? "Noch keine Abschlüsse in diesem Zeitraum." : "No completions in this period yet."}</p>}
        <svg width={width} height={height} role="img" aria-label={`${title}: ${total} ${de ? "Abschlüsse" : "completions"}`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" strokeWidth={1} />
              <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-faint text-[11px]">
                {t}
              </text>
            </g>
          ))}
          {periods.map((p, i) => {
            const x0 = pad.left + i * band + (band - (barW * 2 + 2)) / 2;
            return (
              <g key={p.start}>
                {hover === i && <rect x={pad.left + i * band} y={pad.top} width={band} height={innerH} fill="var(--surface-2)" />}
                <path d={bar(x0, p.final_exam_passed)} fill={series[0].color} />
                <path d={bar(x0 + barW + 2, p.certified)} fill={series[1].color} />
                {i % labelEvery === 0 && (
                  <text x={pad.left + i * band + band / 2} y={height - 8} textAnchor="middle" className="fill-faint text-[11px]">
                    {periodLabel(p.start, granularity, locale)}
                  </text>
                )}
                {/* Trefferfläche: ganzer Zeitraum, größer als die Säulen */}
                <rect x={pad.left + i * band} y={pad.top} width={band} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${periodLabel(p.start, granularity, locale)}: ${series[0].label} ${p.final_exam_passed}, ${series[1].label} ${p.certified}`} />
              </g>
            );
          })}
          <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="var(--border)" strokeWidth={1} />
        </svg>
        {tip && hover !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
            // Neben den Zeitraum, nie darüber: die Säulen, die man ansieht, bleiben sichtbar.
            style={{ left: pad.left + hover * band + band / 2 > width / 2 ? Math.max(0, pad.left + hover * band - 188) : Math.min(width - 180, pad.left + (hover + 1) * band + 8), top: 0, width: 180 }}
            role="tooltip"
          >
            <p className="mb-1 font-semibold">{periodLabel(tip.start, granularity, locale)}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-subtle">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                  {s.label}
                </span>
                <span className="font-medium tabular-nums">{tip[s.key]}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-subtle">{de ? "Als Tabelle" : "As table"}</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-xs text-subtle">
                <th className="px-3 py-1.5">{de ? "Zeitraum ab" : "Period from"}</th>
                {series.map((s) => (
                  <th key={s.key} className="px-3 py-1.5 text-right">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.start} className="border-t border-border-subtle">
                  <td className="px-3 py-1">{p.start}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{p.final_exam_passed}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{p.certified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
