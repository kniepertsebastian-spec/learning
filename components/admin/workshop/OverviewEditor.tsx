"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import { CourseOverviewView } from "@/components/CourseOverviewView";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { courseOverviewSchema, emptyOverview, OVERVIEW_LIMITS, overviewIsUntranslated, type CourseOverview } from "@/lib/course-overview";
import type { CourseScope } from "@/lib/server/course-overview/service";
import { api, Field, inputCls, Problems, useTr, useUnsavedWarning, type Lang } from "./shared";

type ListField = "outcomes" | "benefits" | "prerequisites";
type TextField = "summary" | "audience";

/**
 * Kursbeschreibung bearbeiten (roadmap3.md, Schritt 4). Einsprachige Kurse (beide Sprachfelder gleich) werden in
 * beiden Feldern zugleich bearbeitet, übersetzte getrennt. „Mit KI erzeugen“ füllt nur das Formular, gespeichert
 * wird erst mit „Speichern“.
 */
export function OverviewEditor({ certId, locale, onDirtyChange }: { certId: string; locale: Lang; onDirtyChange: (dirty: boolean) => void }) {
  const tr = useTr(locale);
  const [saved, setSaved] = React.useState<CourseOverview | null | undefined>(undefined);
  const [value, setValue] = React.useState<CourseOverview>(emptyOverview());
  const [scope, setScope] = React.useState<CourseScope | undefined>();
  // Stand, nach dem sich richtet, ob beide Sprachen zugleich bearbeitet werden (beim Laden, Speichern und Entwurf).
  const [base, setBase] = React.useState<CourseOverview>(emptyOverview());
  const [lang, setLang] = React.useState<Lang>(locale);
  const [busy, setBusy] = React.useState<"save" | "draft" | null>(null);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string; items?: string[] } | null>(null);

  React.useEffect(() => {
    void (async () => {
      const r = await api<{ overview: CourseOverview | null; scope: CourseScope }>(`/api/admin/certifications/${certId}/workshop/overview`);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setSaved(r.data.overview);
      setValue(r.data.overview ?? emptyOverview());
      setBase(r.data.overview ?? emptyOverview());
      setScope(r.data.scope);
    })();
  }, [certId]);

  const dirty = saved !== undefined && JSON.stringify(value) !== JSON.stringify(saved ?? emptyOverview());
  React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useUnsavedWarning(dirty);

  // Einsprachig = beide Felder gleich: dann gilt jede Änderung für beide Sprachen.
  const linked = overviewIsUntranslated(base);
  const langs: Lang[] = linked ? ["de", "en"] : [lang];
  const setIn = <T,>(current: { de: T; en: T }, v: T) => ({ ...current, ...Object.fromEntries(langs.map((l) => [l, v])) }) as { de: T; en: T };

  const setText = (field: TextField, v: string) => setValue((o) => ({ ...o, [field]: setIn(o[field], v) }));
  const setList = (field: ListField, text: string) => setValue((o) => ({ ...o, [field]: setIn(o[field], text.split("\n").map((s) => s.replace(/^\s+/, ""))) }));
  const setEssential = (i: number, key: "title" | "why", v: string) =>
    setValue((o) => ({ ...o, essentialWhen: o.essentialWhen.map((e, j) => (j === i ? { ...e, [key]: setIn(e[key], v) } : e)) }));
  const addEssential = () => setValue((o) => ({ ...o, essentialWhen: [...o.essentialWhen, { title: { de: "", en: "" }, why: { de: "", en: "" } }] }));
  const removeEssential = (i: number) => setValue((o) => ({ ...o, essentialWhen: o.essentialWhen.filter((_, j) => j !== i) }));

  // Leere Zeilen fallen beim Speichern weg, sie dienen nur dem Tippen.
  const cleaned = (): CourseOverview => {
    const lines = (l: { de: string[]; en: string[] }) => ({ de: l.de.map((s) => s.trim()).filter(Boolean), en: l.en.map((s) => s.trim()).filter(Boolean) });
    return { ...value, outcomes: lines(value.outcomes), benefits: lines(value.benefits), prerequisites: lines(value.prerequisites) };
  };

  async function save() {
    setMsg(null);
    const parsed = courseOverviewSchema.safeParse(cleaned());
    if (!parsed.success) return setMsg({ ok: false, text: tr("Noch nicht vollständig.", "Not complete yet."), items: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`) });
    setBusy("save");
    const r = await api<{ overview: CourseOverview }>(`/api/admin/certifications/${certId}/workshop/overview`, { method: "PUT", body: parsed.data });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error, items: r.problems });
    setSaved(r.data.overview);
    setValue(r.data.overview);
    setBase(r.data.overview);
    setMsg({ ok: true, text: tr("Gespeichert. Lernende sehen die Beschreibung sofort.", "Saved. Learners see the description right away.") });
  }

  async function draft() {
    if (dirty && !window.confirm(tr("Die KI überschreibt die aktuellen Eingaben im Formular (gespeichert wird erst mit „Speichern“). Fortfahren?", "The AI replaces the current form entries (nothing is saved until you press “Save”). Continue?"))) return;
    setBusy("draft");
    setMsg(null);
    const r = await api<{ overview: CourseOverview }>(`/api/admin/certifications/${certId}/workshop/overview/draft`, { method: "POST" });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    // Der Entwurf steht in beiden Sprachfeldern (Kurssprache): der Übersetzungslauf übersetzt ihn danach neu.
    setValue(r.data.overview);
    setBase(r.data.overview);
    setMsg({ ok: true, text: tr("Entwurf der KI eingesetzt. Lies ihn durch, passe an und speichere. Die Übersetzung in die andere Sprache folgt über den Übersetzungslauf.", "AI draft inserted. Read it, adjust and save. The other language follows with the translation run.") });
  }

  if (saved === undefined && !msg) return <p className="text-sm text-subtle">{tr("Lade …", "Loading …")}</p>;

  const L = langs[0];
  const lines = (f: ListField) => value[f][L].join("\n");

  return (
    <div className="flex flex-col gap-5" data-testid="overview-editor">
      <div>
        <h2 className="text-lg font-semibold">{tr("Kursbeschreibung", "Course description")}</h2>
        <p className="mt-1 text-sm text-subtle">
          {tr(
            "Lernende sehen sie vor dem Start: worum es geht, was sie danach können, was es bringt und wo das Wissen unverzichtbar ist. Der Umfang (Lektionen, Fragen, Lernzeit) wird automatisch gezählt.",
            "Learners see it before they start: what it is about, what they can do afterwards, what it gives them and where the knowledge is essential. The scope (lessons, questions, study time) is counted automatically.",
          )}
        </p>
      </div>
      {msg && (msg.ok ? <p role="status" className="rounded-xl border border-success/40 bg-success-soft p-3 text-sm text-success-text">{msg.text}</p> : <Problems title={msg.text} items={msg.items} />)}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void draft()} disabled={busy !== null} data-testid="overview-draft">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {busy === "draft" ? tr("Die KI schreibt …", "The AI is writing …") : tr("Mit KI erzeugen", "Generate with AI")}
        </Button>
        {!linked && (
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label={tr("Sprache", "Language")}>
            {(["de", "en"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={cn("rounded-md px-3 py-1 text-sm", lang === l && "bg-accent-soft font-medium")}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        {linked && <span className="text-xs text-subtle">{tr("Einsprachig: Änderungen gelten für beide Sprachen, bis der Kurs übersetzt ist.", "Single language: changes apply to both languages until the course is translated.")}</span>}
      </div>

      <div className="grid gap-4">
        <Field label={tr("Worum geht es?", "What is it about?")} hint={`${value.summary[L].length}/${OVERVIEW_LIMITS.summary}`}>
          <textarea className={inputCls} rows={4} value={value.summary[L]} onChange={(e) => setText("summary", e.target.value)} data-testid="overview-summary" />
        </Field>
        <Field label={tr("Das kannst du danach (eine Zeile je Punkt)", "What you can do afterwards (one line per item)")}>
          <textarea className={inputCls} rows={5} value={lines("outcomes")} onChange={(e) => setList("outcomes", e.target.value)} />
        </Field>
        <Field label={tr("Das bringt dir das (eine Zeile je Punkt)", "What it gives you (one line per item)")}>
          <textarea className={inputCls} rows={4} value={lines("benefits")} onChange={(e) => setList("benefits", e.target.value)} />
        </Field>
        <fieldset className="rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-medium">{tr("Wo das Wissen unverzichtbar ist", "Where the knowledge is essential")}</legend>
          <div className="flex flex-col gap-3">
            {value.essentialWhen.map((e, i) => (
              <div key={i} className="rounded-lg bg-surface-2 p-3">
                <div className="flex items-start gap-2">
                  <input className={inputCls} value={e.title[L]} onChange={(ev) => setEssential(i, "title", ev.target.value)} placeholder={tr("Situation", "Situation")} aria-label={tr("Situation", "Situation")} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeEssential(i)} aria-label={tr("Entfernen", "Remove")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <textarea className={cn(inputCls, "mt-2")} rows={3} value={e.why[L]} onChange={(ev) => setEssential(i, "why", ev.target.value)} placeholder={tr("Warum unverzichtbar?", "Why is it essential?")} aria-label={tr("Begründung", "Reason")} />
              </div>
            ))}
            {value.essentialWhen.length < OVERVIEW_LIMITS.essential && (
              <Button type="button" variant="secondary" onClick={addEssential} className="self-start">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {tr("Situation hinzufügen", "Add situation")}
              </Button>
            )}
          </div>
        </fieldset>
        <Field label={tr("Für wen ist der Kurs?", "Who is it for?")}>
          <textarea className={inputCls} rows={3} value={value.audience[L]} onChange={(e) => setText("audience", e.target.value)} />
        </Field>
        <Field label={tr("Vorkenntnisse (eine Zeile je Punkt, leer = keine nötig)", "Prerequisites (one line per item, empty = none needed)")}>
          <textarea className={inputCls} rows={3} value={lines("prerequisites")} onChange={(e) => setList("prerequisites", e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy !== null || !dirty} data-testid="overview-save">
          {busy === "save" ? tr("Speichere …", "Saving …") : tr("Speichern", "Save")}
        </Button>
        {dirty && <span className="text-xs text-subtle">{tr("Ungespeicherte Änderungen", "Unsaved changes")}</span>}
      </div>

      {courseOverviewSchema.safeParse(cleaned()).success && (
        <div className="rounded-2xl border border-border-subtle p-4">
          <p className="mb-3 text-xs font-semibold tracking-overline text-faint uppercase">{tr("Vorschau für Lernende", "Learner preview")}</p>
          <CourseOverviewView overview={cleaned()} scope={scope} locale={L} />
        </div>
      )}
    </div>
  );
}
