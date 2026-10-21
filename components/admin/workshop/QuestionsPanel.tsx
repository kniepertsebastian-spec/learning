"use client";

import { ChevronDown, Flag, Plus, Save } from "lucide-react";
import * as React from "react";
import { RichText } from "@/components/RichText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import type { AiProposal, QuestionProposal, QuestionsProposal } from "@/lib/server/course-editor/ai";
import type { NewQuestion, QuestionSnapshot } from "@/lib/server/course-editor/snapshots";
import { QUESTION_AI_ACTIONS, type AiAction } from "@/lib/workshop-ai";
import { acceptMessage, AiAssist, ProposalReview, type AcceptResult } from "./AiAssist";
import { RevisionHistory } from "./RevisionHistory";
import { api, DiffView, Field, inputCls, Problems, textareaCls, useTr, useUnsavedWarning, type L, type Lang } from "./shared";

type Item = { id: string; humanId: string; snapshot: QuestionSnapshot; fingerprint: string; openReports: number };
type Draft = Omit<QuestionSnapshot, "options"> & { options: Array<{ id: string | null; orderNum: number; text: L; isCorrect: boolean; rationale: L }> };

const DIFFS = [
  ["beginner", "Einsteiger", "Beginner"],
  ["intermediate", "Fortgeschritten", "Intermediate"],
  ["advanced", "Experte", "Advanced"],
] as const;
const TYPES = [
  ["knowledge", "Wissen", "Knowledge"],
  ["comprehension", "Verständnis", "Comprehension"],
  ["application", "Anwendung", "Application"],
  ["scenario", "Szenario", "Scenario"],
  ["troubleshooting", "Fehlersuche", "Troubleshooting"],
] as const;

const empty = (): L => ({ de: "", en: "" });
function toDraft(q: QuestionSnapshot): Draft {
  return { ...q, options: q.options.map((o) => ({ ...o, rationale: o.rationale ?? empty() })) };
}
const NEW: () => Draft = () => ({
  question: empty(),
  explanation: empty(),
  difficulty: "intermediate",
  type: "application",
  options: [0, 1, 2, 3].map((i) => ({ id: null, orderNum: i + 1, text: empty(), isCorrect: i === 0, rationale: empty() })),
});
const rationaleOrNull = (r: L) => (r.de.trim() || r.en.trim() ? r : null);
const sameInBoth = (d: Draft) => d.question.de === d.question.en && d.explanation.de === d.explanation.en && d.options.every((o) => o.text.de === o.text.en && o.rationale.de === o.rationale.en);

/** Text einer Frage für den Versionsvergleich: Frage, Optionen (✓ = richtig) mit Begründung, Erklärung. */
function questionText(q: QuestionSnapshot, lang: Lang): string {
  return [
    q.question[lang],
    "",
    ...q.options.map((o, i) => `${o.isCorrect ? "✓" : "·"} ${String.fromCharCode(65 + i)}) ${o.text[lang]}${o.rationale?.[lang] ? `\n    ↳ ${o.rationale[lang]}` : ""}`),
    "",
    `${q.difficulty} · ${q.type}`,
    "",
    q.explanation[lang],
  ].join("\n");
}

/** Alle Fragen eines Lernziels: aufklappbar bearbeiten, mit Versionen; neue Frage anlegen. */
export function QuestionsPanel({
  certId,
  objectiveId,
  locale,
  onChanged,
  onDirtyChange,
  initialAiAction = null,
}: {
  certId: string;
  objectiveId: string;
  locale: Lang;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  initialAiAction?: AiAction | null;
}) {
  const tr = useTr(locale);
  const [items, setItems] = React.useState<Item[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [lang, setLang] = React.useState<Lang>(locale);
  const [dirtyIds, setDirtyIds] = React.useState<Set<string>>(new Set());
  const [proposal, setProposal] = React.useState<(QuestionsProposal & AiProposal) | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const r = await api<{ questions: Item[] }>(`/api/admin/certifications/${certId}/workshop/objectives/${objectiveId}/questions`);
    if (r.ok) setItems(r.data.questions);
    else setError(r.error);
  }, [certId, objectiveId]);
  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const markDirty = React.useCallback((id: string, dirty: boolean) => {
    setDirtyIds((s) => {
      if (s.has(id) === dirty) return s;
      const n = new Set(s);
      if (dirty) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);
  React.useEffect(() => onDirtyChange(dirtyIds.size > 0), [dirtyIds, onDirtyChange]);
  useUnsavedWarning(dirtyIds.size > 0);

  if (error) return <Problems title={error} />;
  if (!items) return <p className="text-sm text-subtle">{tr("Lade …", "Loading …")}</p>;

  return (
    <div className="flex flex-col gap-3" data-testid="questions-panel">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl value={lang} onChange={setLang} options={[{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }]} label={tr("Sprache", "Language")} />
        <span className="text-sm text-subtle">{items.length} {tr("Fragen", "questions")}</span>
        <Button className="ml-auto" size="sm" variant={open === "new" ? "ghost" : "secondary"} onClick={() => setOpen(open === "new" ? null : "new")} iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />} data-testid="question-new">
          {tr("Neue Frage", "New question")}
        </Button>
      </div>
      {message && <p className="rounded-xl border border-mint-border bg-mint-soft p-3 text-sm text-mint-text" role="status">{message}</p>}
      {proposal ? (
        <NewQuestionsReview
          certId={certId}
          objectiveId={objectiveId}
          locale={locale}
          lang={lang}
          proposal={proposal}
          onDone={async (msg) => {
            setProposal(null);
            if (msg) {
              setMessage(msg);
              await load();
              onChanged();
            }
          }}
        />
      ) : (
        <AiAssist certId={certId} locale={locale} target={{ target: "objective", id: objectiveId }} actions={["add_questions"]} initialAction={initialAiAction === "add_questions" ? "add_questions" : null} onProposal={(p) => {
            if (p.kind !== "questions") return;
            setMessage(null);
            setProposal(p);
          }} />
      )}
      {open === "new" && (
        <div className="rounded-2xl border border-accent-border bg-surface p-4">
          <QuestionForm
            active
            certId={certId}
            objectiveId={objectiveId}
            item={null}
            lang={lang}
            locale={locale}
            onDirty={(d) => markDirty("new", d)}
            onSaved={async () => {
              markDirty("new", false);
              setOpen(null);
              await load();
              onChanged();
            }}
          />
        </div>
      )}
      {items.map((q) => (
        <div key={q.id} className={cn("rounded-2xl border bg-surface", open === q.id ? "border-accent-border" : "border-border")} data-testid="question-item">
          <button type="button" className="flex w-full items-start gap-3 p-3 text-left" onClick={() => setOpen(open === q.id ? null : q.id)} aria-expanded={open === q.id}>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                <span className="font-mono">{q.humanId}</span>
                {q.openReports > 0 && (
                  <Badge tone="warning">
                    <Flag className="h-3 w-3" aria-hidden="true" />
                    {q.openReports} {tr("Meldung(en)", "report(s)")}
                  </Badge>
                )}
                {dirtyIds.has(q.id) && <Badge tone="warning">{tr("ungespeichert", "unsaved")}</Badge>}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-sm">{q.snapshot.question[lang]}</span>
            </span>
            <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 transition-transform", open === q.id && "rotate-180")} aria-hidden="true" />
          </button>
          {/* Zugeklappte Formulare bleiben gemountet, damit ungespeicherte Eingaben beim Zuklappen nicht verloren gehen. */}
          <div className={cn("border-t border-border-subtle p-4", open !== q.id && "hidden")}>
            <QuestionForm
              key={q.fingerprint}
              active={open === q.id}
              certId={certId}
              objectiveId={objectiveId}
              item={q}
              lang={lang}
              locale={locale}
              onDirty={(d) => markDirty(q.id, d)}
              onSaved={async (msg) => {
                markDirty(q.id, false);
                setMessage(msg ?? null);
                await load();
                onChanged();
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function QuestionForm({ active, certId, objectiveId, item, lang, locale, onDirty, onSaved }: { active: boolean; certId: string; objectiveId: string; item: Item | null; lang: Lang; locale: Lang; onDirty: (dirty: boolean) => void; onSaved: (message?: string) => void }) {
  const tr = useTr(locale);
  const initial = React.useMemo(() => (item ? toDraft(item.snapshot) : NEW()), [item]);
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [linked, setLinked] = React.useState(() => sameInBoth(initial));
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ kind: "ok" | "error" | "conflict"; title: string; items?: string[]; fingerprint?: string } | null>(null);
  const [proposal, setProposal] = React.useState<(QuestionProposal & AiProposal) | null>(null);
  const [aiPending, setAiPending] = React.useState<{ action: AiAction; resolveReports: boolean } | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  React.useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const setL = (cur: L, value: string): L => (linked ? { de: value, en: value } : { ...cur, [lang]: value });
  const setOption = (i: number, patch: Partial<Draft["options"][number]>) => setDraft((d) => ({ ...d, options: d.options.map((o, k) => (k === i ? { ...o, ...patch } : o)) }));
  const missing = !draft.question.de.trim() || !draft.question.en.trim() || !draft.explanation.de.trim() || !draft.explanation.en.trim() || draft.options.some((o) => !o.text.de.trim() || !o.text.en.trim());

  async function save(base?: string, direct?: { snapshot: QuestionSnapshot; ai: { action: AiAction; resolveReports: boolean } }) {
    setBusy(true);
    setResult(null);
    const options = draft.options.map((o) => ({ ...o, rationale: rationaleOrNull(o.rationale) }));
    const ai = direct?.ai ?? aiPending ?? undefined;
    const r = item
      ? await api<{ fingerprint: string } & AcceptResult>(`/api/admin/certifications/${certId}/workshop/questions/${item.id}`, { method: "PUT", body: { snapshot: direct?.snapshot ?? { ...draft, options }, baseFingerprint: base ?? item.fingerprint, ai } })
      : await api<{ questionId: string }>(`/api/admin/certifications/${certId}/workshop/objectives/${objectiveId}/questions`, { method: "POST", body: { question: { ...draft, options: options.map(({ text, isCorrect, rationale }) => ({ text, isCorrect, rationale })) } } });
    setBusy(false);
    if (r.ok) {
      return onSaved(ai ? acceptMessage(r.data as AcceptResult, tr) : undefined);
    }
    if (r.status === 409) return setResult({ kind: "conflict", title: tr("Diese Frage wurde inzwischen geändert.", "This question was changed in the meantime."), fingerprint: r.fingerprint });
    setResult({ kind: "error", title: r.error, items: r.problems });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="question-form">
      {item && active && !proposal && (
        <AiAssist
          certId={certId}
          locale={locale}
          target={{ target: "question", id: item.id }}
          actions={[...QUESTION_AI_ACTIONS].filter((a) => a !== "fix_reports" || item.openReports > 0)}
          disabled={dirty ? tr("Erst speichern oder Änderungen verwerfen.", "Save or discard your changes first.") : null}
          onProposal={(p) => p.kind === "question" && setProposal(p)}
        />
      )}
      {item && proposal && (
        <ProposalReview
          locale={locale}
          proposal={proposal}
          translated={!sameInBoth(toDraft(item.snapshot))}
          hasReports={item.openReports > 0}
          busy={busy}
          onAccept={(resolveReports) => void save(proposal.baseFingerprint, { snapshot: proposal.snapshot, ai: { action: proposal.action, resolveReports } })}
          onAdjust={() => {
            const d = toDraft(proposal.snapshot);
            setDraft(d);
            setLinked(sameInBoth(d));
            setAiPending({ action: proposal.action, resolveReports: true });
            setProposal(null);
          }}
          onDiscard={() => setProposal(null)}
        >
          <DiffView before={questionText(item.snapshot, proposal.locale)} after={questionText(proposal.snapshot, proposal.locale)} locale={locale} testId="ai-diff" />
        </ProposalReview>
      )}
      {aiPending && <p className="rounded-xl border border-accent-border bg-accent-soft p-3 text-sm" role="status">{tr("Der KI-Vorschlag steht im Formular. Anpassen und speichern; er wird mit Herkunft „KI“ eingetragen.", "The AI proposal is in the form. Adjust and save; it is recorded with origin “AI”.")}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
        {tr("Beide Sprachen gleich", "Same text in both languages")}
      </label>
      <Field label={tr("Frage (Markdown)", "Question (Markdown)")}>
        <textarea className={cn(textareaCls, "min-h-28")} value={draft.question[lang]} onChange={(e) => setDraft({ ...draft, question: setL(draft.question, e.target.value) })} data-testid="question-text" />
      </Field>
      {draft.question[lang].includes("```") && (
        <div className="rounded-xl border border-border bg-background p-3 text-sm">
          <RichText text={draft.question[lang]} />
        </div>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{tr("Antwortoptionen (genau eine richtig)", "Answer options (exactly one correct)")}</legend>
        {draft.options.map((o, i) => (
          <div key={o.id ?? i} className={cn("grid gap-2 rounded-xl border p-2.5 sm:grid-cols-[auto_1fr]", o.isCorrect ? "border-mint-border bg-mint-soft/40" : "border-border-subtle")}>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="radio" name={`correct-${item?.id ?? "new"}`} checked={o.isCorrect} onChange={() => setDraft((d) => ({ ...d, options: d.options.map((x, k) => ({ ...x, isCorrect: k === i })) }))} aria-label={tr(`Option ${String.fromCharCode(65 + i)} ist richtig`, `Option ${String.fromCharCode(65 + i)} is correct`)} />
              {String.fromCharCode(65 + i)}
            </label>
            <div className="flex min-w-0 flex-col gap-1.5">
              <input className={inputCls} value={o.text[lang]} onChange={(e) => setOption(i, { text: setL(o.text, e.target.value) })} placeholder={tr("Antworttext", "Answer text")} data-testid="option-text" />
              {!o.isCorrect && <input className={cn(inputCls, "text-xs")} value={o.rationale[lang]} onChange={(e) => setOption(i, { rationale: setL(o.rationale, e.target.value) })} placeholder={tr("Warum falsch? (optional)", "Why wrong? (optional)")} />}
            </div>
          </div>
        ))}
      </fieldset>
      <Field label={tr("Erklärung (Markdown)", "Explanation (Markdown)")}>
        <textarea className={cn(textareaCls, "min-h-24")} value={draft.explanation[lang]} onChange={(e) => setDraft({ ...draft, explanation: setL(draft.explanation, e.target.value) })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("Schwierigkeit", "Difficulty")}>
          <select className={inputCls} value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Draft["difficulty"] })}>
            {DIFFS.map(([v, de, en]) => (
              <option key={v} value={v}>{locale === "de" ? de : en}</option>
            ))}
          </select>
        </Field>
        <Field label={tr("Fragetyp", "Question type")}>
          <select className={inputCls} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Draft["type"] })}>
            {TYPES.map(([v, de, en]) => (
              <option key={v} value={v}>{locale === "de" ? de : en}</option>
            ))}
          </select>
        </Field>
      </div>
      {result?.kind === "error" && <Problems title={result.title} items={result.items} />}
      {result?.kind === "conflict" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-text" role="alert">
          <span className="font-semibold">{result.title}</span>
          <Button size="sm" variant="secondary" onClick={() => onSaved()}>{tr("Neu laden", "Reload")}</Button>
          <Button size="sm" variant="ghost" onClick={() => void save(result.fingerprint)}>{tr("Trotzdem speichern", "Save anyway")}</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty || missing} iconLeft={<Save className="h-4 w-4" aria-hidden="true" />} data-testid="question-save">
          {item ? tr("Frage speichern", "Save question") : tr("Frage anlegen", "Create question")}
        </Button>
        {dirty && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(initial);
              setAiPending(null);
            }}
          >
            {tr("Verwerfen", "Discard")}
          </Button>
        )}
        {missing && dirty && <span className="text-xs text-subtle">{tr("Frage, Erklärung und alle Optionen brauchen Text in beiden Sprachen.", "Question, explanation and all options need text in both languages.")}</span>}
      </div>
      {item && active && (
        <RevisionHistory
          key={item.fingerprint}
          certId={certId}
          targetType="question"
          targetId={item.id}
          locale={locale}
          lang={lang}
          currentText={questionText(item.snapshot, lang)}
          toText={(data, l) => questionText(data as QuestionSnapshot, l)}
          disabled={dirty ? tr("Erst speichern oder Änderungen verwerfen.", "Save or discard your changes first.") : null}
          onRestored={() => onSaved()}
        />
      )}
    </div>
  );
}

/** Neue Fragen aus „Fragen ergänzen“: einzeln an- oder abwählen, dann gesammelt anlegen (danach normal bearbeitbar). */
function NewQuestionsReview({ certId, objectiveId, locale, lang, proposal, onDone }: { certId: string; objectiveId: string; locale: Lang; lang: Lang; proposal: QuestionsProposal & AiProposal; onDone: (message: string | null) => void }) {
  const tr = useTr(locale);
  const [picked, setPicked] = React.useState<Set<number>>(() => new Set(proposal.questions.map((_, i) => i)));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toggle = (i: number) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  });

  async function accept() {
    const questions: NewQuestion[] = proposal.questions.filter((_, i) => picked.has(i));
    setBusy(true);
    const r = await api<{ created: unknown[] } & AcceptResult>(`/api/admin/certifications/${certId}/workshop/objectives/${objectiveId}/questions`, { method: "POST", body: { questions, ai: true } });
    setBusy(false);
    if (!r.ok) return setError(r.problems?.length ? `${r.error} ${r.problems.join(" ")}` : r.error);
    onDone(`${tr(`${questions.length} Fragen angelegt.`, `${questions.length} questions created.`)} ${acceptMessage(r.data, tr)}`);
  }

  return (
    <ProposalReview locale={locale} proposal={proposal} translated={false} busy={busy || picked.size === 0} onAccept={() => void accept()} onDiscard={() => onDone(null)} acceptLabel={tr(`${picked.size} Fragen anlegen`, `Create ${picked.size} questions`)}>
      {error && <Problems title={error} />}
      <ul className="flex flex-col gap-2" data-testid="ai-new-questions">
        {proposal.questions.map((q, i) => (
          <li key={i} className={cn("rounded-xl border p-3 text-sm", picked.has(i) ? "border-accent-border" : "border-border-subtle opacity-60")}>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={picked.has(i)} onChange={() => toggle(i)} aria-label={tr(`Frage ${i + 1} übernehmen`, `Accept question ${i + 1}`)} />
              <span className="min-w-0 flex-1">
                <RichText text={q.question[lang]} />
                <ul className="mt-1 flex flex-col gap-0.5">
                  {q.options.map((o, k) => (
                    <li key={k} className={cn(o.isCorrect && "font-semibold text-mint-text")}>{o.isCorrect ? "✓" : "·"} {String.fromCharCode(65 + k)}) {o.text[lang]}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-subtle">{q.explanation[lang]}</p>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">{tr("Nach dem Anlegen lassen sich die Fragen wie alle anderen bearbeiten.", "After creating them you can edit the questions like any other.")}</p>
    </ProposalReview>
  );
}
