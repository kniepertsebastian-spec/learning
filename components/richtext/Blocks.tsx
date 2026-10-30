"use client";

import { ArrowRight, ChevronDown, Wrench } from "lucide-react";
import * as React from "react";
import { Callout, type CalloutTone } from "@/components/ui/callout";
import { SegmentedControl } from "@/components/ui/tabs";
import { useLocaleOptional } from "@/lib/i18n";
import { PRACTICE_PARTS, type PracticePart } from "@/lib/markdown/blocks";
import { cn } from "@/lib/cn";

type ElProps = { children?: React.ReactNode } & Record<string, unknown>;
const childElements = (children: React.ReactNode) => React.Children.toArray(children).filter((c): c is React.ReactElement<ElProps> => React.isValidElement(c));

export function CalloutBlock({ kind, children }: { kind: CalloutTone; children: React.ReactNode }) {
  const { t } = useLocaleOptional();
  const title = { exam: t.lesson_blocks.calloutExam, mistake: t.lesson_blocks.calloutMistake, memo: t.lesson_blocks.calloutMemo, info: t.lesson_blocks.calloutNote, possible: t.lesson_blocks.calloutPossible }[kind];
  return (
    <Callout tone={kind} title={title} className="my-3">
      {children}
    </Callout>
  );
}

export function TabsBlock({ children }: { children: React.ReactNode }) {
  const { t } = useLocaleOptional();
  const tabs = childElements(children).map((el, i) => ({ value: String(i), label: String(el.props["data-tab"] ?? i + 1), body: el.props.children }));
  const [active, setActive] = React.useState("0");
  if (tabs.length === 0) return null;
  return (
    <div className="my-3" data-testid="tabs-block">
      <SegmentedControl value={active} onChange={setActive} options={tabs.map(({ value, label }) => ({ value, label }))} label={t.lesson_blocks.variants} />
      <div className="mt-2">{tabs.find((tab) => tab.value === active)?.body}</div>
    </div>
  );
}

/** Ablauf: Kästen mit Pfeilen, umbrechend. */
export function StepsBlock({ children }: { children: React.ReactNode }) {
  const steps = childElements(children).map((el) => ({ label: String(el.props["data-step"] ?? ""), body: el.props.children }));
  return (
    <ol className="my-3 flex flex-wrap items-stretch gap-2" data-testid="steps-block">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <li className="min-w-[120px] flex-1 basis-[140px] rounded-xl border border-border bg-surface p-3">
            <p className="text-2xs font-semibold tracking-overline text-faint uppercase">{i + 1}</p>
            <p className="mt-0.5 text-sm font-semibold">{s.label}</p>
            {s.body ? <div className="mt-1 font-mono text-xs break-words text-code-key">{s.body}</div> : null}
          </li>
          {i < steps.length - 1 && <ArrowRight className="hidden h-4 w-4 shrink-0 self-center text-faint sm:block" aria-hidden="true" />}
        </React.Fragment>
      ))}
    </ol>
  );
}

export function PracticeBlock({ children, minutes }: { children: React.ReactNode; minutes?: string }) {
  const { t } = useLocaleOptional();
  const [open, setOpen] = React.useState(false);
  const parts = new Map<PracticePart, React.ReactNode>();
  for (const el of childElements(children)) {
    const p = el.props["data-part"] as PracticePart | undefined;
    if (p && (PRACTICE_PARTS as readonly string[]).includes(p)) parts.set(p, el.props.children);
  }
  const tile = "min-w-0 rounded-2xl border border-border bg-surface p-5 [&>*:first-child]:mt-0";
  const label = "mb-1.5 text-2xs font-semibold tracking-overline text-faint uppercase";
  return (
    <section className="my-4 rounded-2xl border border-info/40 bg-surface-inset p-4 sm:p-5" data-testid="practice-block" aria-label={t.lesson_blocks.practice}>
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-info-soft text-info-text" aria-hidden="true">
          <Wrench className="h-[18px] w-[18px]" />
        </span>
        <p className="text-meta font-semibold tracking-wide text-info-text uppercase">{t.lesson_blocks.practice}</p>
        {minutes && <span className="ml-auto text-xs text-faint">ca. {minutes} {t.lesson_blocks.minutes}</span>}
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={tile}>
          <p className={label}>1 · {t.lesson_blocks.scenario}</p>
          {parts.get("scenario")}
        </div>
        <div className={tile}>
          <p className={label}>2 · {t.lesson_blocks.task}</p>
          {parts.get("task")}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="practice-solution-toggle"
        className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-border-strong bg-control px-4 text-sm font-semibold hover:bg-surface-2"
      >
        <span>3 · {open ? t.lesson_blocks.hideSolution : t.lesson_blocks.showSolution}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3" data-testid="practice-solution">
          <div className={tile}>
            <p className={label}>3 · {t.lesson_blocks.solution}</p>
            {parts.get("solution")}
          </div>
          <div className={tile}>
            <p className={label}>4 · {t.lesson_blocks.why}</p>
            {parts.get("why")}
          </div>
        </div>
      )}
    </section>
  );
}
