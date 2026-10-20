"use client";

import { ChevronDown, Flag, Plus, Save } from "lucide-react";
import * as React from "react";
import { RichText } from "@/components/RichText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import type { QuestionSnapshot } from "@/lib/server/course-editor/snapshots";
import { RevisionHistory } from "./RevisionHistory";
import { api, Field, inputCls, Problems, textareaCls, useTr, useUnsavedWarning, type L, type Lang } from "./shared";

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
export function QuestionsPanel({ certId, objectiveId, locale, onChanged, onDirtyChange }: { certId: string; objectiveId: string; locale: Lang; onChanged: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const tr = useTr(locale);
  const [items, setItems] = React.useState<Item[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [lang, setLang] = React.useState<Lang>(locale);
  const [dirtyIds, setDirtyIds] = React.useState<Set<string>>(new Set());

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
              onSaved={async () => {
                markDirty(q.id, false);
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

function QuestionForm({ active, certId, objectiveId, item, lang, locale, onDirty, onSaved }: { active: boolean; certId: string; objectiveId: string; item: Item | null; lang: Lang; locale: Lang; onDirty: (dirty: boolean) => void; onSaved: () => void }) {
  const tr = useTr(locale);
  const initial = React.useMemo(() => (item ? toDraft(item.snapshot) : NEW()), [item]);
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [linked, setLinked] = React.useState(() => sameInBoth(initial));
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ kind: "ok" | "error" | "conflict"; title: string; items?: string[]; fingerprint?: string } | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  React.useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const setL = (cur: L, value: string): L => (linked ? { de: value, en: value } : { ...cur, [lang]: value });
  const setOption = (i: number, patch: Partial<Draft["options"][number]>) => setDraft((d) => ({ ...d, options: d.options.map((o, k) => (k === i ? { ...o, ...patch } : o)) }));
  const missing = !draft.question.de.trim() || !draft.question.en.trim() || !draft.explanation.de.trim() || !draft.explanation.en.trim() || draft.options.some((o) => !o.text.de.trim() || !o.text.en.trim());

  async function save(base?: string) {
    setBusy(true);
    setResult(null);
    const options = draft.options.map((o) => ({ ...o, rationale: rationaleOrNull(o.rationale) }));
    const r = item
      ? await api<{ fingerprint: string }>(`/api/admin/certifications/${certId}/workshop/questions/${item.id}`, { method: "PUT", body: { snapshot: { ...draft, options }, baseFingerprint: base ?? item.fingerprint } })
      : await api<{ questionId: string }>(`/api/admin/certifications/${certId}/workshop/objectives/${objectiveId}/questions`, { method: "POST", body: { question: { ...draft, options: options.map(({ text, isCorrect, rationale }) => ({ text, isCorrect, rationale })) } } });
    setBusy(false);
    if (r.ok) return onSaved();
    if (r.status === 409) return setResult({ kind: "conflict", title: tr("Diese Frage wurde inzwischen geändert.", "This question was changed in the meantime."), fingerprint: r.fingerprint });
    setResult({ kind: "error", title: r.error, items: r.problems });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="question-form">
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
          <Button size="sm" variant="secondary" onClick={onSaved}>{tr("Neu laden", "Reload")}</Button>
          <Button size="sm" variant="ghost" onClick={() => void save(result.fingerprint)}>{tr("Trotzdem speichern", "Save anyway")}</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty || missing} iconLeft={<Save className="h-4 w-4" aria-hidden="true" />} data-testid="question-save">
          {item ? tr("Frage speichern", "Save question") : tr("Frage anlegen", "Create question")}
        </Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(initial)}>{tr("Verwerfen", "Discard")}</Button>}
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
          onRestored={onSaved}
        />
      )}
    </div>
  );
}
