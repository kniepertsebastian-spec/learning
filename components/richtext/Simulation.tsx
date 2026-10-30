"use client";

import { BookOpen, CheckCircle2, GitBranch, Lightbulb, RotateCcw, SlidersHorizontal, SquareTerminal, XCircle } from "lucide-react";
import * as React from "react";
import { MentorAskForm } from "@/components/MentorAskForm";
import { useLessonSimulations } from "@/components/lesson/LessonSimulations";
import { WovenStep } from "@/components/lesson/WovenStep";
import { RichText } from "@/components/RichText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelfExplanation } from "@/components/quiz/SelfExplanation";
import { useLocaleOptional } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/quiz/keys";
import type { WovenQuestion } from "@/lib/server/weaving/candidates";
import {
  commandMatches,
  parseSimulation,
  splitTemplate,
  type ConfigSimulation,
  type DecisionSimulation,
  type Simulation,
  type TerminalSimulation,
} from "@/lib/markdown/simulation";

/**
 * Interaktive Simulation in einer Lektion (Format siehe lib/markdown/simulation.ts). Läuft vollständig im Browser, ohne
 * Server und ohne gespeicherten Fortschritt: ein Übungsraum, in dem man Fehler machen darf. Hilfen (Tipp, Lösung zeigen)
 * werden gezählt und am Ende genannt, damit „ohne Hilfe gelöst“ etwas bedeutet.
 */
const SimMeta = React.createContext<{ spec: string; review: string[] } | null>(null);

export function SimulationBlock({ spec }: { spec: string }) {
  const parsed = React.useMemo(() => parseSimulation(spec), [spec]);
  const [run, setRun] = React.useState(0);
  if (!parsed.ok) return null;
  const restart = () => setRun((r) => r + 1);
  const sim = parsed.simulation;
  return (
    <SimMeta.Provider value={{ spec, review: sim.review ?? [] }}>
      <Frame sim={sim} onRestart={restart}>
        {sim.type === "terminal" ? <TerminalSim key={run} sim={sim} /> : sim.type === "decision" ? <DecisionSim key={run} sim={sim} restarts={run} onRestart={restart} /> : <ConfigSim key={run} sim={sim} />}
      </Frame>
    </SimMeta.Provider>
  );
}

const ICONS = { terminal: SquareTerminal, decision: GitBranch, config: SlidersHorizontal } as const;

function Frame({ sim, onRestart, children }: { sim: Simulation; onRestart: () => void; children: React.ReactNode }) {
  const { t, locale } = useLocaleOptional();
  const Icon = ICONS[sim.type];
  const lesson = useLessonSimulations();
  const kind = { terminal: t.lesson_blocks.simTerminal, decision: t.lesson_blocks.simDecision, config: t.lesson_blocks.simConfig }[sim.type];
  const meta = React.useContext(SimMeta);
  // Sprungmarke für die Simulations-Übersicht des Kurses (/cert/…/simulations → Lektion#simulation-2).
  const index = lesson && meta ? lesson.indexOf(meta.spec) : -1;
  return (
    <section id={index >= 0 ? `simulation-${index + 1}` : undefined} className="my-4 scroll-mt-24 rounded-2xl border border-accent-border bg-surface-inset p-4 sm:p-5" data-testid="simulation-block" data-sim-type={sim.type} aria-label={`${kind}: ${sim.title}`}>
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent-soft text-link" aria-hidden="true">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-2xs font-semibold tracking-overline text-link uppercase">{kind}</p>
          <p className="text-body font-semibold">{sim.title}</p>
        </div>
        {lesson && (
          <Button variant="ghost" size="sm" onClick={() => lesson.openText()} iconLeft={<BookOpen className="h-3.5 w-3.5" aria-hidden="true" />} data-testid="simulation-open-text">
            {t.lesson_blocks.simShowText}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onRestart} iconLeft={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}>
          {t.lesson_blocks.simRestart}
        </Button>
      </header>
      <div className="rounded-xl border border-border bg-surface p-4 text-body [&>*:first-child]:mt-0">
        <RichText text={sim.scenario} />
      </div>
      <div className="mt-3">{children}</div>
      {lesson?.mentorAsk && <MentorAskForm topic={`${lesson.mentorAsk.topic} · ${sim.title}`.slice(0, 200)} certificationId={lesson.mentorAsk.certificationId} locale={locale} />}
    </section>
  );
}

/**
 * Abschluss; `helps` = genutzte Hilfen (Tipp, Lösung, Fehlversuche), `null` = ohne Zählung („Gelöst“). Meldet die Lösung
 * einmal an die Lektion (Speichern, Wiederholung) und verweist auf die Textstellen, die man nachlesen kann.
 */
function SolvedBanner({ helps, children, selfExplain }: { helps: number | null; children: React.ReactNode; selfExplain?: { key: string; model: string } }) {
  const { t, locale } = useLocaleOptional();
  const lesson = useLessonSimulations();
  const meta = React.useContext(SimMeta);
  const [struggled, setStruggled] = React.useState(false);
  const [woven, setWoven] = React.useState<WovenQuestion | null>(null);
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (reported.current || !lesson || !meta) return;
    reported.current = true;
    // Ohne Zählung (nach einem Neustart der Entscheidung) gilt die Runde als „mit einer Hilfe“.
    void lesson.reportSolved(meta.spec, helps ?? 1).then((r) => {
      setStruggled(Boolean(r?.struggled));
      setWoven(r?.woven?.[0] ?? null);
    });
    // Einmal je eingeblendetem Banner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const title = helps === null ? t.lesson_blocks.simSolved : helps === 0 ? t.lesson_blocks.simSolvedClean : fmt(t.lesson_blocks.simSolvedHelped, { n: String(helps) });
  // Nur Überschriften, die es im Text der Lektion wirklich gibt (die KI schreibt sie ab, kann sich aber vertun).
  const review = lesson && meta ? meta.review.filter((h) => lesson.headings.some((x) => x.trim() === h.trim())) : [];
  return (
    <div className="mt-3 flex gap-3 rounded-xl border border-mint-border bg-mint-soft p-4" data-testid="simulation-solved" role="status">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-mint-text" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-meta font-semibold tracking-wide text-mint-text uppercase">{title}</p>
        <div className="mt-1 text-body leading-relaxed text-text-2">{children}</div>
        {review.length > 0 && (
          <div className="mt-3" data-testid="simulation-review">
            <p className="text-xs font-semibold text-subtle">{t.lesson_blocks.simReviewTitle}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {review.map((h) => (
                <button key={h} type="button" onClick={() => lesson?.openText(h)} className="rounded-full border border-border-strong bg-surface px-3 py-1 text-left text-meta hover:bg-surface-2">
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}
        {struggled && <p className="mt-3 text-sm text-subtle" data-testid="simulation-struggled">{t.lesson_blocks.simStruggled}</p>}
        {woven && lesson && <WovenStep sectionId={lesson.sectionId} question={woven} locale={locale} />}
        {selfExplain && <SelfExplanation storageKey={selfExplain.key} prompt={locale === "de" ? "Erkläre in einem Satz, warum dieser Weg zum Ziel geführt hat." : "Explain in one sentence why this path led to the goal."} modelAnswer={selfExplain.model} locale={locale} />}
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  const { t } = useLocaleOptional();
  return (
    <div className="mt-2 flex gap-2 rounded-lg border border-info/40 bg-info-soft px-3 py-2 text-sm text-info-text" data-testid="simulation-hint">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">{t.lesson_blocks.simHint}: </span>
        {children}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- Terminal */

type TermLine = { cmd: string; output: string; ok: boolean };

function TerminalSim({ sim }: { sim: TerminalSimulation }) {
  const { t } = useLocaleOptional();
  const [step, setStep] = React.useState(0);
  const [lines, setLines] = React.useState<TermLine[]>([]);
  const [input, setInput] = React.useState("");
  const [misses, setMisses] = React.useState(0);
  const [hintShown, setHintShown] = React.useState(false);
  const [helps, setHelps] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const done = step >= sim.steps.length;
  const current = sim.steps[step];
  const prompt = sim.prompt || "$";

  React.useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [lines.length]);

  const advance = (cmd: string) => {
    setLines((l) => [...l, { cmd, output: current.output, ok: true }]);
    setStep((s) => s + 1);
    setMisses(0);
    setHintShown(false);
    setInput("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (done || !input.trim()) return;
    if (commandMatches(input, current.accept)) return advance(input.trim());
    setLines((l) => [...l, { cmd: input.trim(), output: t.lesson_blocks.simWrong, ok: false }]);
    setMisses((m) => m + 1);
    setInput("");
  };

  const showHint = () => {
    if (!hintShown) setHelps((h) => h + 1);
    setHintShown(true);
  };
  const reveal = () => {
    setHelps((h) => h + 1);
    advance(current.accept[0]);
    inputRef.current?.focus();
  };

  return (
    <div>
      {!done && (
        <div className="mb-3 rounded-xl border border-border bg-surface p-3" data-testid="simulation-goal">
          <p className="text-2xs font-semibold tracking-overline text-faint uppercase">
            {fmt(t.lesson_blocks.simStep, { x: String(step + 1), y: String(sim.steps.length) })} · {t.lesson_blocks.simGoal}
          </p>
          <p className="mt-0.5 text-body">{current.goal}</p>
          {(hintShown || misses >= 2) && <Hint>{current.hint}</Hint>}
        </div>
      )}
      <div className="overflow-hidden rounded-[14px] border border-border bg-surface-inset" onClick={() => inputRef.current?.focus()}>
        <div className="flex items-center gap-2 border-b border-border-subtle bg-surface px-3.5 py-1.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-track" />
            <span className="h-2.5 w-2.5 rounded-full bg-track" />
            <span className="h-2.5 w-2.5 rounded-full bg-track" />
          </span>
          <span className="font-mono text-xs text-subtle">{t.lesson_blocks.terminal}</span>
        </div>
        <div className="max-h-80 overflow-auto p-3.5 font-mono text-meta leading-relaxed" aria-live="polite" data-testid="simulation-terminal">
          {lines.map((l, i) => (
            <div key={i} data-row={l.ok ? "ok" : "wrong"}>
              <div className="break-all whitespace-pre-wrap">
                <span className="text-mint-text select-none">{prompt} </span>
                <span className="text-foreground">{l.cmd}</span>
              </div>
              {l.output && <div className={cn("whitespace-pre-wrap", l.ok ? "text-code-muted" : "text-warning-text")}>{l.output}</div>}
            </div>
          ))}
          {!done && (
            <form onSubmit={submit} className="flex items-center gap-2">
              <span className="text-mint-text select-none" aria-hidden="true">
                {prompt}
              </span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label={t.lesson_blocks.simInput}
                placeholder={t.lesson_blocks.simInput}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="min-h-9 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-faint"
                data-testid="simulation-input"
              />
              <button type="submit" className="sr-only">
                {t.lesson_blocks.simRun}
              </button>
            </form>
          )}
          <div ref={endRef} />
        </div>
      </div>
      {!done ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => inputRef.current?.form?.requestSubmit()}>
            {t.lesson_blocks.simRun}
          </Button>
          <Button variant="secondary" size="sm" onClick={showHint} disabled={hintShown || misses >= 2}>
            {t.lesson_blocks.simShowHint}
          </Button>
          <Button variant="ghost" size="sm" onClick={reveal} data-testid="simulation-reveal">
            {t.lesson_blocks.simReveal}
          </Button>
        </div>
      ) : (
        <SolvedBanner helps={helps} selfExplain={{ key: `sim:${sim.title}`, model: sim.success }}>
          <RichText text={sim.success} />
        </SolvedBanner>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Entscheidung */

const STATUS_TONE = { ok: "mint", warn: "warning", bad: "danger" } as const;

function DecisionSim({ sim, restarts, onRestart }: { sim: DecisionSimulation; restarts: number; onRestart: () => void }) {
  const { t } = useLocaleOptional();
  const byId = React.useMemo(() => new Map(sim.nodes.map((n) => [n.id, n])), [sim]);
  const [nodeId, setNodeId] = React.useState(sim.start);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [path, setPath] = React.useState<string[]>([]);
  const node = byId.get(nodeId)!;
  const choice = picked !== null ? node.choices?.[picked] : undefined;

  const next = () => {
    if (!choice) return;
    setPath((p) => [...p, choice.label]);
    setNodeId(choice.next);
    setPicked(null);
  };

  return (
    <div>
      {path.length > 0 && (
        <details className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
          <summary className="cursor-pointer text-subtle">
            {t.lesson_blocks.simPath} ({path.length})
          </summary>
          <ol className="mt-1 list-decimal pl-5">
            {path.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </details>
      )}
      {node.status && node.status.length > 0 && (
        <div className="mb-3 rounded-xl border border-border bg-surface p-3" data-testid="simulation-status">
          <p className="mb-1.5 text-2xs font-semibold tracking-overline text-faint uppercase">{t.lesson_blocks.simStatus}</p>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {node.status.map((s, i) => (
              <div key={i} className="flex min-w-0 items-center justify-between gap-2">
                <dt className="text-subtle">{s.label}</dt>
                <dd className="min-w-0 truncate">{s.tone ? <Badge tone={STATUS_TONE[s.tone]}>{s.value}</Badge> : <span className="font-mono text-meta">{s.value}</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {node.outcome === "success" ? (
        <SolvedBanner helps={restarts === 0 ? 0 : null} selfExplain={{ key: `sim:${sim.title}`, model: node.text }}>
          <RichText text={node.text} />
        </SolvedBanner>
      ) : node.outcome === "failure" ? (
        <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4" data-testid="simulation-failed" role="status">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-text" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-meta font-semibold tracking-wide text-warning-text uppercase">{t.lesson_blocks.simFailed}</p>
            <div className="mt-1 text-body leading-relaxed text-text-2">
              <RichText text={node.text} />
              <p className="mt-2 text-sm text-subtle">{t.lesson_blocks.simFailedBody}</p>
            </div>
            <Button className="mt-3" size="sm" onClick={onRestart} iconLeft={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}>
              {t.lesson_blocks.simRestart}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-body [&>*:first-child]:mt-0" data-testid="simulation-situation">
            <RichText text={node.text} />
          </div>
          <div className="mt-3 flex flex-col gap-2" role="group" aria-label={sim.title}>
            {(node.choices ?? []).map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={picked !== null}
                onClick={() => setPicked(i)}
                aria-pressed={picked === i}
                data-testid="simulation-choice"
                className={cn(
                  "min-h-11 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors",
                  picked === i ? "border-accent bg-accent-soft font-semibold" : "border-border-strong bg-control hover:bg-surface-2",
                  picked !== null && picked !== i && "opacity-60",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          {choice && (
            <div className="mt-3 rounded-xl border border-border bg-surface p-3" aria-live="polite" data-testid="simulation-feedback">
              <div className="text-sm [&>*:first-child]:mt-0">
                <RichText text={choice.feedback} />
              </div>
              <Button className="mt-3" size="sm" onClick={next}>
                {t.lesson_blocks.simContinue}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Konfiguration */

function ConfigSim({ sim }: { sim: ConfigSimulation }) {
  const { t } = useLocaleOptional();
  const parts = React.useMemo(() => splitTemplate(sim.template), [sim.template]);
  const blanks = React.useMemo(() => new Map(sim.blanks.map((b, i) => [b.id, { ...b, n: i + 1 }])), [sim.blanks]);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [checked, setChecked] = React.useState<Set<string> | null>(null); // falsche Lücken nach „Anwenden“
  const [attempts, setAttempts] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  // Gelöst nur durch „Anwenden“ mit allen Werten richtig: eine korrigierte Lücke allein löst noch nichts.
  const [solved, setSolved] = React.useState(false);
  const finished = solved || revealed;

  const apply = () => {
    const wrong = new Set(sim.blanks.filter((b) => values[b.id] !== b.answer).map((b) => b.id));
    setAttempts((a) => a + 1);
    setChecked(wrong);
    setSolved(wrong.size === 0);
  };
  const reveal = () => {
    setValues(Object.fromEntries(sim.blanks.map((b) => [b.id, b.answer])));
    setChecked(new Set());
    setSolved(true);
    setRevealed(true);
  };
  const helps = (revealed ? 1 : 0) + Math.max(0, attempts - 1);

  return (
    <div>
      <figure className="max-w-full overflow-hidden rounded-[14px] border border-border bg-surface-inset">
        {sim.file && (
          <figcaption className="border-b border-border-subtle bg-surface px-3.5 py-1.5 font-mono text-xs text-subtle">{sim.file}</figcaption>
        )}
        <pre className="overflow-x-auto p-3.5 font-mono text-meta leading-[2.1] text-foreground" data-testid="simulation-template">
          {parts.map((p, i) => {
            if ("text" in p) return <React.Fragment key={i}>{p.text}</React.Fragment>;
            const b = blanks.get(p.blank)!;
            const wrong = checked?.has(b.id) ?? false;
            const ok = checked !== null && !wrong && values[b.id] !== undefined;
            return (
              <select
                key={i}
                value={values[b.id] ?? ""}
                disabled={finished}
                aria-label={fmt(t.lesson_blocks.simBlank, { n: String(b.n) })}
                aria-invalid={wrong || undefined}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [b.id]: e.target.value }));
                  setChecked((c) => (c ? new Set([...c].filter((x) => x !== b.id)) : c));
                }}
                data-testid="simulation-select"
                className={cn(
                  "mx-0.5 rounded-md border bg-control px-1.5 py-0.5 font-mono text-meta text-foreground",
                  wrong ? "border-danger bg-danger-soft" : ok ? "border-mint-border bg-mint-soft" : "border-accent-border",
                )}
              >
                <option value="" disabled>
                  {fmt(t.lesson_blocks.simBlank, { n: String(b.n) })}: {t.lesson_blocks.simChoose}
                </option>
                {b.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          })}
        </pre>
      </figure>

      {checked !== null && (solved ? sim.successOutput : sim.failureOutput) && (
        <pre className={cn("mt-3 overflow-x-auto rounded-[14px] border p-3.5 font-mono text-meta leading-relaxed whitespace-pre-wrap", solved ? "border-border bg-surface-inset text-code-muted" : "border-danger/40 bg-danger-soft text-danger-text")} data-testid="simulation-output">
          {solved ? sim.successOutput : sim.failureOutput}
        </pre>
      )}
      {checked !== null && !solved && (
        <p className="mt-2 text-sm text-warning-text" role="status">
          {fmt(t.lesson_blocks.simApplyWrong, { n: String(checked.size), m: String(sim.blanks.length) })}
        </p>
      )}

      {!finished ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={apply} disabled={sim.blanks.some((b) => !values[b.id])} data-testid="simulation-apply">
            {t.lesson_blocks.simApply}
          </Button>
          <Button variant="ghost" size="sm" onClick={reveal} data-testid="simulation-reveal">
            {t.lesson_blocks.simReveal}
          </Button>
        </div>
      ) : (
        <>
          <SolvedBanner helps={helps} selfExplain={{ key: `sim:${sim.title}`, model: sim.success }}>
            <RichText text={sim.success} />
          </SolvedBanner>
          <ul className="mt-3 flex flex-col gap-2" data-testid="simulation-explanations">
            {sim.blanks.map((b, i) => (
              <li key={b.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <p className="text-2xs font-semibold tracking-overline text-faint uppercase">
                  {fmt(t.lesson_blocks.simBlank, { n: String(i + 1) })} · <span className="font-mono normal-case">{b.answer}</span>
                </p>
                <p className="mt-0.5">{b.explanation}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
