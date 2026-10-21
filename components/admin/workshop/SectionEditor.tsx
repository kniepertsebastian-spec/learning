"use client";

import { Save } from "lucide-react";
import * as React from "react";
import { RichText } from "@/components/RichText";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/tabs";
import { validateLearningBlocks } from "@/lib/markdown/validate";
import { cn } from "@/lib/cn";
import type { AiProposal, SectionProposal } from "@/lib/server/course-editor/ai";
import type { SectionSnapshot } from "@/lib/server/course-editor/snapshots";
import { SECTION_AI_ACTIONS, type AiAction } from "@/lib/workshop-ai";
import { acceptMessage, AiAssist, ProposalReview, type AcceptResult } from "./AiAssist";
import { RevisionHistory } from "./RevisionHistory";
import { api, DiffView, Field, inputCls, Problems, textareaCls, useTr, useUnsavedWarning, type L, type Lang } from "./shared";

/** Entwurf im Editor: Listen als Text (eine Zeile je Punkt), Merkzettel immer vorhanden. */
type Draft = { title: L; minutes: string; difficulty: string; content: L; cheatSheet: L; keyTakeaways: L; examFocusPoints: L };

const lines = (l: { de: string[]; en: string[] } | null): L => ({ de: (l?.de ?? []).join("\n"), en: (l?.en ?? []).join("\n") });
const toList = (t: L) => ({ de: t.de.split("\n").map((s) => s.trim()).filter(Boolean), en: t.en.split("\n").map((s) => s.trim()).filter(Boolean) });

function toDraft(s: SectionSnapshot): Draft {
  return {
    title: s.title,
    minutes: s.estimatedMinutes?.toString() ?? "",
    difficulty: s.difficulty ?? "",
    content: s.content,
    cheatSheet: s.cheatSheet ?? { de: "", en: "" },
    keyTakeaways: lines(s.keyTakeaways),
    examFocusPoints: lines(s.examFocusPoints),
  };
}

function toSnapshot(d: Draft): SectionSnapshot {
  return {
    title: d.title,
    estimatedMinutes: d.minutes ? Number(d.minutes) : null,
    difficulty: d.difficulty || null,
    content: d.content,
    cheatSheet: d.cheatSheet.de.trim() || d.cheatSheet.en.trim() ? d.cheatSheet : null,
    keyTakeaways: toList(d.keyTakeaways),
    examFocusPoints: toList(d.examFocusPoints),
  };
}

/** Sind beide Sprachen gleich? Dann ist der Kurs (noch) einsprachig und der Editor ändert beide zusammen. */
const sameInBoth = (d: Draft) => (["title", "content", "cheatSheet", "keyTakeaways", "examFocusPoints"] as const).every((k) => d[k].de === d[k].en);

const EMPTY: Draft = { title: { de: "", en: "" }, minutes: "15", difficulty: "intermediate", content: { de: "", en: "" }, cheatSheet: { de: "", en: "" }, keyTakeaways: { de: "", en: "" }, examFocusPoints: { de: "", en: "" } };

/**
 * Lektion bearbeiten: Markdown mit Live-Vorschau (genau die Lerneransicht, mit Simulationen und Blöcken), laufender
 * Prüfung der Lernblöcke, Versionsgeschichte. `sectionId = null` legt eine neue Lektion im Lernziel an.
 */
export function SectionEditor({
  certId,
  sectionId,
  objectiveId,
  locale,
  onSaved,
  onDirtyChange,
  openReports = 0,
  initialAiAction = null,
}: {
  certId: string;
  sectionId: string | null;
  objectiveId: string;
  locale: Lang;
  onSaved: (sectionId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  openReports?: number;
  /** Aus dem Qualitätsbericht: KI-Panel gleich mit dieser Aktion öffnen. */
  initialAiAction?: AiAction | null;
}) {
  const tr = useTr(locale);
  const [saved, setSaved] = React.useState<{ snapshot: SectionSnapshot; fingerprint: string } | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(sectionId ? null : EMPTY);
  const [linked, setLinked] = React.useState(true);
  const [lang, setLang] = React.useState<Lang>(locale);
  const [view, setView] = React.useState<"split" | "edit" | "preview">("split");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ kind: "ok" | "error" | "conflict"; title: string; items?: string[]; fingerprint?: string } | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [proposal, setProposal] = React.useState<(SectionProposal & AiProposal) | null>(null);
  /** KI-Vorschlag ins Formular übernommen („Anpassen“): Speichern trägt ihn mit Herkunft „KI“ ein. */
  const [aiPending, setAiPending] = React.useState<{ action: AiAction; resolveReports: boolean } | null>(null);

  const load = React.useCallback(async () => {
    if (!sectionId) return;
    const r = await api<{ snapshot: SectionSnapshot; fingerprint: string }>(`/api/admin/certifications/${certId}/workshop/sections/${sectionId}`);
    if (!r.ok) return setLoadError(r.error);
    const d = toDraft(r.data.snapshot);
    setSaved(r.data);
    setDraft(d);
    setLinked(sameInBoth(d));
    setResult(null);
    setAiPending(null);
  }, [certId, sectionId]);
  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const dirty = React.useMemo(() => {
    if (!draft) return false;
    if (!saved) return Boolean(draft.title.de || draft.content.de);
    return JSON.stringify(toSnapshot(draft)) !== JSON.stringify(toSnapshot(toDraft(saved.snapshot)));
  }, [draft, saved]);
  React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useUnsavedWarning(dirty);

  const problems = React.useMemo(() => {
    if (!draft) return [];
    const langs: Lang[] = linked ? [lang] : ["de", "en"];
    return langs.flatMap((l) => [...validateLearningBlocks(draft.content[l]).map((p) => `${tr("Lerntext", "Content")} (${l}): ${p}`), ...validateLearningBlocks(draft.cheatSheet[l]).map((p) => `${tr("Merkzettel", "Cheat sheet")} (${l}): ${p}`)]);
  }, [draft, linked, lang, tr]);

  if (loadError) return <Problems title={loadError} />;
  if (!draft) return <p className="text-sm text-subtle">{tr("Lade …", "Loading …")}</p>;

  /** Feld in der aktuellen Sprache ändern; bei verknüpften Sprachen in beiden. */
  const set = (key: "title" | "content" | "cheatSheet" | "keyTakeaways" | "examFocusPoints", value: string) =>
    setDraft((d) => (d ? { ...d, [key]: linked ? { de: value, en: value } : { ...d[key], [lang]: value } } : d));

  async function save(base?: string, direct?: { snapshot: SectionSnapshot; ai: { action: AiAction; resolveReports: boolean } }) {
    if (!draft) return;
    setBusy(true);
    setResult(null);
    const snapshot = direct?.snapshot ?? toSnapshot(draft);
    const ai = direct?.ai ?? aiPending ?? undefined;
    const r = sectionId
      ? await api<{ fingerprint: string; changed: boolean } & AcceptResult>(`/api/admin/certifications/${certId}/workshop/sections/${sectionId}`, { method: "PUT", body: { snapshot, baseFingerprint: base ?? saved!.fingerprint, note: note || undefined, ai } })
      : await api<{ sectionId: string; fingerprint: string }>(`/api/admin/certifications/${certId}/workshop/objectives/${objectiveId}/sections`, { method: "POST", body: { snapshot } });
    setBusy(false);
    if (r.ok) {
      setNote("");
      if (!sectionId) {
        onDirtyChange(false);
        return onSaved((r.data as { sectionId: string }).sectionId);
      }
      const d = toDraft(snapshot);
      setSaved({ snapshot, fingerprint: r.data.fingerprint });
      setDraft(d);
      setLinked(sameInBoth(d));
      setProposal(null);
      setAiPending(null);
      setResult({ kind: "ok", title: ai ? acceptMessage(r.data as AcceptResult, tr) : tr("Gespeichert. Lernende sehen die neue Fassung sofort.", "Saved. Learners see the new version right away.") });
      return onSaved(sectionId);
    }
    if (r.status === 409) return setResult({ kind: "conflict", title: tr("Jemand (oder ein Skript) hat diese Lektion inzwischen geändert.", "Someone (or a script) changed this lesson in the meantime."), fingerprint: r.fingerprint });
    setResult({ kind: "error", title: r.error, items: r.problems });
  }

  const content = draft.content[lang];
  const otherLang: Lang = lang === "de" ? "en" : "de";

  return (
    <div className="flex flex-col gap-4" data-testid="section-editor">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl value={lang} onChange={setLang} options={[{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }]} label={tr("Sprache", "Language")} />
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: "split", label: tr("Nebeneinander", "Side by side") },
            { value: "edit", label: tr("Bearbeiten", "Edit") },
            { value: "preview", label: tr("Vorschau", "Preview") },
          ]}
          label={tr("Ansicht", "View")}
        />
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} data-testid="link-languages" />
          {tr("Beide Sprachen gleich", "Same text in both languages")}
        </label>
      </div>
      {linked ? (
        <p className="-mt-2 text-xs text-faint">{tr("Der Kurs ist (noch) nicht übersetzt: Änderungen gelten für beide Sprachfelder. Haken weg, um die Sprachen getrennt zu bearbeiten.", "This course isn't translated (yet): changes apply to both language fields. Untick to edit the languages separately.")}</p>
      ) : (
        draft.content[otherLang] === saved?.snapshot.content[otherLang] &&
        dirty && <p className="-mt-2 text-xs text-warning-text">{tr(`Denk an die andere Sprache (${otherLang}): sie wird nicht automatisch angepasst.`, `Remember the other language (${otherLang}): it isn't updated automatically.`)}</p>
      )}

      {sectionId && saved && !proposal && (
        <AiAssist
          key={`ai-${saved.fingerprint}`}
          certId={certId}
          locale={locale}
          target={{ target: "section", id: sectionId }}
          actions={[...SECTION_AI_ACTIONS].filter((a) => a !== "fix_reports" || openReports > 0)}
          initialAction={initialAiAction}
          disabled={dirty ? tr("Erst speichern oder Änderungen verwerfen: der Vorschlag baut auf dem gespeicherten Stand auf.", "Save or discard your changes first: the proposal builds on the saved version.") : null}
          onProposal={(p) => p.kind === "section" && setProposal(p)}
        />
      )}
      {proposal && saved && (
        <ProposalReview
          locale={locale}
          proposal={proposal}
          translated={!sameInBoth(toDraft(saved.snapshot))}
          hasReports={openReports > 0}
          busy={busy}
          onAccept={(resolveReports) => void save(proposal.baseFingerprint, { snapshot: proposal.snapshot, ai: { action: proposal.action, resolveReports } })}
          onAdjust={() => {
            const d = toDraft(proposal.snapshot);
            setDraft(d);
            setLinked(sameInBoth(d));
            setLang(proposal.locale);
            setAiPending({ action: proposal.action, resolveReports: true });
            setProposal(null);
          }}
          onDiscard={() => setProposal(null)}
        >
          <p className="text-xs text-subtle">{tr("Unterschied: gespeichert (rot) → Vorschlag (grün)", "Difference: saved (red) → proposal (green)")}</p>
          <DiffView before={sectionText(saved.snapshot, proposal.locale)} after={sectionText(proposal.snapshot, proposal.locale)} locale={locale} testId="ai-diff" />
          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{tr("Vorschau des Vorschlags (so sähen es Lernende)", "Preview of the proposal (as learners would see it)")}</summary>
            <div className="max-h-[60vh] overflow-y-auto border-t border-border bg-background p-4 text-[15px] leading-relaxed" data-testid="ai-preview">
              <RichText text={proposal.snapshot.content[proposal.locale]} headingIds />
            </div>
          </details>
        </ProposalReview>
      )}
      {aiPending && (
        <p className="rounded-xl border border-accent-border bg-accent-soft p-3 text-sm" role="status" data-testid="ai-pending">
          {tr("Der KI-Vorschlag steht im Editor. Passe ihn an und speichere; er wird mit Herkunft „KI“ eingetragen.", "The AI proposal is in the editor. Adjust it and save; it is recorded with origin “AI”.")}{" "}
          <button type="button" className="font-medium underline" onClick={() => void load()}>{tr("Verwerfen", "Discard")}</button>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_120px_160px]">
        <Field label={tr("Titel", "Title")}>
          <input className={inputCls} value={draft.title[lang]} onChange={(e) => set("title", e.target.value)} data-testid="section-title" />
        </Field>
        <Field label={tr("Minuten", "Minutes")}>
          <input className={inputCls} type="number" min={1} max={240} value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: e.target.value })} />
        </Field>
        <Field label={tr("Schwierigkeit", "Difficulty")}>
          <select className={inputCls} value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}>
            <option value="">–</option>
            <option value="beginner">{tr("Einsteiger", "Beginner")}</option>
            <option value="intermediate">{tr("Fortgeschritten", "Intermediate")}</option>
            <option value="advanced">{tr("Experte", "Advanced")}</option>
          </select>
        </Field>
      </div>

      <div className={cn("grid gap-4", view === "split" && "xl:grid-cols-2")}>
        {view !== "preview" && (
          <Field label={tr("Lerntext (Markdown)", "Content (Markdown)")} hint={tr("Blöcke: > [!EXAM] · ```console · :::practice · :::steps · :::tabs · ```simulation (siehe course_generation.md)", "Blocks: > [!EXAM] · ```console · :::practice · :::steps · :::tabs · ```simulation (see course_generation.md)")}>
            <textarea className={cn(textareaCls, "min-h-[60vh]")} value={content} onChange={(e) => set("content", e.target.value)} spellCheck data-testid="section-content" />
          </Field>
        )}
        {view !== "edit" && (
          <div className="min-w-0">
            <p className="mb-1 text-sm font-medium">{tr("Vorschau (so sehen es Lernende)", "Preview (as learners see it)")}</p>
            <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-background p-4 text-[15px] leading-relaxed" data-testid="section-preview">
              <RichText text={content} headingIds />
            </div>
          </div>
        )}
      </div>

      {problems.length > 0 && <Problems tone="warning" title={tr("Diese Blöcke sind fehlerhaft und verhindern das Speichern:", "These blocks are invalid and prevent saving:")} items={problems} />}

      <details className="rounded-xl border border-border bg-surface p-3">
        <summary className="cursor-pointer text-sm font-medium">{tr("Merkzettel, Kernaussagen, Prüfungsschwerpunkte", "Cheat sheet, key takeaways, exam focus")}</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Field label={tr("Merkzettel (Markdown)", "Cheat sheet (Markdown)")}>
            <textarea className={cn(textareaCls, "min-h-40")} value={draft.cheatSheet[lang]} onChange={(e) => set("cheatSheet", e.target.value)} />
          </Field>
          <Field label={tr("Kernaussagen", "Key takeaways")} hint={tr("eine je Zeile", "one per line")}>
            <textarea className={cn(textareaCls, "min-h-40")} value={draft.keyTakeaways[lang]} onChange={(e) => set("keyTakeaways", e.target.value)} />
          </Field>
          <Field label={tr("Prüfungsschwerpunkte", "Exam focus points")} hint={tr("einer je Zeile", "one per line")}>
            <textarea className={cn(textareaCls, "min-h-40")} value={draft.examFocusPoints[lang]} onChange={(e) => set("examFocusPoints", e.target.value)} />
          </Field>
        </div>
      </details>

      {result?.kind === "ok" && <p className="rounded-xl border border-mint-border bg-mint-soft p-3 text-sm text-mint-text" role="status">{result.title}</p>}
      {result?.kind === "error" && <Problems title={result.title} items={result.items} />}
      {result?.kind === "conflict" && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-text" role="alert" data-testid="edit-conflict">
          <p className="font-semibold">{result.title}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void load()}>{tr("Neu laden (meine Änderungen verwerfen)", "Reload (discard my changes)")}</Button>
            <Button size="sm" variant="ghost" onClick={() => void save(result.fingerprint)}>{tr("Meine Fassung trotzdem speichern", "Save my version anyway")}</Button>
          </div>
          <p className="text-xs">{tr("Auch beim Überschreiben bleibt die andere Fassung in den Versionen erhalten.", "Even when overwriting, the other version stays in the history.")}</p>
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
        {sectionId && <input className={cn(inputCls, "max-w-sm flex-1")} placeholder={tr("Was wurde geändert? (optional)", "What changed? (optional)")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}
        <Button onClick={() => void save()} disabled={busy || !dirty || problems.length > 0 || !draft.title.de.trim() || !draft.content.de.trim() || !draft.title.en.trim() || !draft.content.en.trim()} iconLeft={<Save className="h-4 w-4" aria-hidden="true" />} data-testid="section-save">
          {sectionId ? tr("Speichern", "Save") : tr("Lektion anlegen", "Create lesson")}
        </Button>
        {dirty && <span className="text-xs text-warning-text">{tr("Ungespeicherte Änderungen", "Unsaved changes")}</span>}
      </div>

      {sectionId && saved && (
        <RevisionHistory
          key={saved.fingerprint}
          certId={certId}
          targetType="section"
          targetId={sectionId}
          locale={locale}
          lang={lang}
          currentText={sectionText(saved.snapshot, lang)}
          toText={(data, l) => sectionText(data as SectionSnapshot, l)}
          disabled={dirty ? tr("Erst speichern oder Änderungen verwerfen.", "Save or discard your changes first.") : null}
          onRestored={() => void load()}
        />
      )}
    </div>
  );
}

/** Text einer Lektion für den Versionsvergleich: Titel, Lerntext, Merkzettel. */
function sectionText(s: SectionSnapshot, lang: Lang): string {
  return [`# ${s.title[lang]}`, "", s.content[lang], ...(s.cheatSheet ? ["", "--- Merkzettel ---", s.cheatSheet[lang]] : [])].join("\n");
}
