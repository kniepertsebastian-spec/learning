"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { ArrowDown, ArrowUp, BookOpen, Bookmark, ChevronDown, ClipboardList, FileText, Flag, HelpCircle, Plus, RotateCcw, SquareTerminal } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { WorkshopTree } from "@/lib/server/course-editor/service";
import type { AiAction } from "@/lib/workshop-ai";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatDate, inputCls, Problems, useTr, type Lang } from "./shared";

// Die Bearbeitungsbereiche sind je nach Auswahl sichtbar, immer nur einer: eigene Chunks, geladen bei der ersten Auswahl.
const PanelLoading = () => <Skeleton className="h-96 w-full rounded-2xl" />;
const CourseReport = dynamic(() => import("./CourseReport").then((m) => m.CourseReport), { loading: PanelLoading });
const OverviewEditor = dynamic(() => import("./OverviewEditor").then((m) => m.OverviewEditor), { loading: PanelLoading });
const QuestionsPanel = dynamic(() => import("./QuestionsPanel").then((m) => m.QuestionsPanel), { loading: PanelLoading });
const SectionEditor = dynamic(() => import("./SectionEditor").then((m) => m.SectionEditor), { loading: PanelLoading });

/** `ai`: aus dem Qualitätsbericht geöffnet, das KI-Panel startet mit dieser Aktion (nicht in der Adresse). */
type Selection = { kind: "section"; id: string; objectiveId: string; ai?: AiAction | null } | { kind: "new-section"; objectiveId: string } | { kind: "questions"; objectiveId: string; ai?: AiAction | null } | { kind: "checkpoints" } | { kind: "report" } | { kind: "overview" } | null;

/** Auswahl in der Adresse (#section=…), damit Neuladen und Links auf dieselbe Stelle führen. */
function parseHash(): Selection {
  const p = new URLSearchParams(window.location.hash.slice(1));
  if (p.get("section") && p.get("objective")) return { kind: "section", id: p.get("section")!, objectiveId: p.get("objective")! };
  if (p.get("questions")) return { kind: "questions", objectiveId: p.get("questions")! };
  if (p.has("checkpoints")) return { kind: "checkpoints" };
  if (p.has("report")) return { kind: "report" };
  if (p.has("overview")) return { kind: "overview" };
  return null;
}
function toHash(s: Selection): string {
  if (!s) return "";
  if (s.kind === "section") return `section=${s.id}&objective=${s.objectiveId}`;
  if (s.kind === "questions") return `questions=${s.objectiveId}`;
  if (s.kind === "checkpoints") return "checkpoints";
  if (s.kind === "report") return "report";
  if (s.kind === "overview") return "overview";
  return "";
}

/**
 * Kurs-Werkstatt (roadmap3.md, Schritt 1): links die Gliederung mit Hinweisen (offene Meldungen, Simulation,
 * bearbeitet), rechts der Editor der gewählten Lektion, die Fragen eines Lernziels oder die gemerkten Kursstände.
 */
export function CourseWorkshop({ certId, courseName, locale, reviewer = false }: { certId: string; courseName: string; locale: Lang; /** Prüfer-Ansicht: nur Lektionen und Fragen von Hand bearbeiten (kein KI-Zugriff, keine Kursverwaltung). */ reviewer?: boolean }) {
  const [confirm, confirmDialog] = useConfirm();
  const tr = useTr(locale);
  const [tree, setTree] = React.useState<WorkshopTree | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<Selection>(null);
  const [dirty, setDirty] = React.useState(false);
  const [outlineOpen, setOutlineOpen] = React.useState(true);

  const loadTree = React.useCallback(async () => {
    const r = await api<{ tree: WorkshopTree }>(`/api/admin/certifications/${certId}/workshop/tree`);
    if (r.ok) setTree(r.data.tree);
    else setError(r.error);
  }, [certId]);
  React.useEffect(() => {
    void (async () => {
      await loadTree();
      const initial = parseHash();
      setSelection(initial);
      if (initial) setOutlineOpen(false);
    })();
  }, [loadTree]);

  const select = async (next: Selection) => {
    if (dirty && !(await confirm(tr("Ungespeicherte Änderungen verwerfen?", "Discard unsaved changes?")))) return;
    setDirty(false);
    setSelection(next);
    setOutlineOpen(false);
    window.history.replaceState(null, "", `#${toHash(next)}`);
  };

  async function move(objectiveId: string, ids: string[], from: number, to: number) {
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    const r = await api(`/api/admin/certifications/${certId}/workshop/objectives/${objectiveId}/order`, { method: "PUT", body: { sectionIds: next } });
    if (!r.ok) setError(r.error);
    await loadTree();
  }

  const objectiveOf = (id: string) => tree?.flatMap((d) => d.objectives).find((o) => o.id === id);
  const sectionOf = (id: string) => tree?.flatMap((d) => d.objectives).flatMap((o) => o.sections).find((s) => s.id === id);
  const current = selection && "objectiveId" in selection ? objectiveOf(selection.objectiveId) : undefined;

  const outline = (
    <nav aria-label={tr("Gliederung", "Outline")} className="flex flex-col gap-4" data-testid="workshop-tree">
      {!reviewer && (<>
      <button type="button" onClick={() => select({ kind: "overview" })} className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium hover:bg-surface-2", selection?.kind === "overview" && "border-accent-border bg-accent-soft")} data-testid="open-overview">
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        {tr("Kursbeschreibung", "Course description")}
      </button>
      <button type="button" onClick={() => select({ kind: "report" })} className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium hover:bg-surface-2", selection?.kind === "report" && "border-accent-border bg-accent-soft")} data-testid="open-report">
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        {tr("Qualitätsbericht", "Quality report")}
      </button>
      <button type="button" onClick={() => select({ kind: "checkpoints" })} className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium hover:bg-surface-2", selection?.kind === "checkpoints" && "border-accent-border bg-accent-soft")}>
        <Bookmark className="h-4 w-4" aria-hidden="true" />
        {tr("Gemerkte Stände", "Saved checkpoints")}
      </button>
      </>)}
      {tree?.length === 0 && <p className="text-sm text-subtle">{tr("Der Kurs hat noch keine Inhalte.", "This course has no content yet.")}</p>}
      {tree?.map((d) => (
        <div key={d.id}>
          <p className="mb-1 text-2xs font-semibold tracking-overline text-faint uppercase">{d.name}</p>
          <ul className="flex flex-col gap-2">
            {d.objectives.map((o) => {
              const ids = o.sections.map((s) => s.id);
              return (
                <li key={o.id} className="rounded-xl border border-border-subtle bg-surface p-2">
                  <p className="px-1 text-sm font-semibold">
                    <span className="font-mono text-xs text-subtle">{o.code}</span> {o.title}
                  </p>
                  <ul className="mt-1 flex flex-col">
                    {o.sections.map((s, i) => {
                      const active = selection?.kind === "section" && selection.id === s.id;
                      return (
                        <li key={s.id} className="group flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => select({ kind: "section", id: s.id, objectiveId: o.id })}
                            aria-current={active ? "true" : undefined}
                            className={cn("flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-2", active && "bg-accent-soft font-medium")}
                            data-testid="tree-section"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                            <span className="min-w-0 truncate">{s.title[locale]}</span>
                            {s.hasSimulation && <SquareTerminal className="h-3.5 w-3.5 shrink-0 text-link" aria-label={tr("mit Simulation", "has simulation")} />}
                            {s.openReports > 0 && (
                              <Badge tone="warning" className="shrink-0 px-1.5">
                                <Flag className="h-3 w-3" aria-hidden="true" />
                                {s.openReports}
                              </Badge>
                            )}
                            {s.revisions > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title={tr("bearbeitet", "edited")} />}
                          </button>
                          <span className="flex shrink-0 opacity-60 group-hover:opacity-100">
                            <button type="button" className="rounded p-1 hover:bg-surface-2 disabled:opacity-30" disabled={i === 0} onClick={() => void move(o.id, ids, i, i - 1)} aria-label={tr("nach oben", "move up")}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" className="rounded p-1 hover:bg-surface-2 disabled:opacity-30" disabled={i === ids.length - 1} onClick={() => void move(o.id, ids, i, i + 1)} aria-label={tr("nach unten", "move down")}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                    <li className="mt-0.5 flex flex-wrap gap-1">
                      <button type="button" onClick={() => select({ kind: "questions", objectiveId: o.id })} className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-surface-2", selection?.kind === "questions" && selection.objectiveId === o.id && "bg-accent-soft font-medium")} data-testid="tree-questions">
                        <HelpCircle className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                        {tr("Fragen", "Questions")} ({o.questionCount})
                        {o.openQuestionReports > 0 && (
                          <Badge tone="warning" className="px-1.5">
                            <Flag className="h-3 w-3" aria-hidden="true" />
                            {o.openQuestionReports}
                          </Badge>
                        )}
                      </button>
                      <button type="button" onClick={() => select({ kind: "new-section", objectiveId: o.id })} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-subtle hover:bg-surface-2 hover:text-foreground">
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr("Lektion", "Lesson")}
                      </button>
                    </li>
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
    {confirmDialog}
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]" data-testid="course-workshop">
      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        {/* Mobil auf- und zuklappbar, ab lg immer sichtbar; nur einmal im DOM. */}
        <button type="button" className="mb-3 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium lg:hidden" aria-expanded={outlineOpen} onClick={() => setOutlineOpen((o) => !o)}>
          {tr("Gliederung", "Outline")}
          <ChevronDown className={cn("h-4 w-4 transition-transform", outlineOpen && "rotate-180")} aria-hidden="true" />
        </button>
        <div className={cn(!outlineOpen && "hidden", "lg:block")}>{outline}</div>
      </aside>
      <div className="min-w-0">
        {error && <div className="mb-3"><Problems title={error} /></div>}
        {!selection && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-subtle">
            <p className="font-medium text-foreground">{courseName}</p>
            <p className="mt-1">{tr("Wähle links eine Lektion oder die Fragen eines Lernziels. Jede Änderung legt den vorherigen Stand in den Versionen ab; unter „Gemerkte Stände“ sicherst du den ganzen Kurs, bevor du größere Änderungen machst.", "Pick a lesson or an objective's questions on the left. Every change keeps the previous version in the history; under “Saved checkpoints” you can save the whole course before larger changes.")}</p>
          </div>
        )}
        {current && <p className="mb-2 text-xs text-subtle"><span className="font-mono">{current.code}</span> {current.title}</p>}
        {selection?.kind === "section" && (
          <SectionEditor
            key={selection.id}
            certId={certId}
            sectionId={selection.id}
            objectiveId={selection.objectiveId}
            locale={locale}
            openReports={sectionOf(selection.id)?.openReports ?? 0}
            initialAiAction={selection.ai}
            noAi={reviewer}
            onDirtyChange={setDirty}
            onSaved={() => void loadTree()}
            onDeleted={() => {
              void loadTree();
              setDirty(false);
              setSelection(null);
              window.history.replaceState(null, "", "#");
            }}
          />
        )}
        {selection?.kind === "new-section" && (
          <SectionEditor
            key={`new-${selection.objectiveId}`}
            certId={certId}
            sectionId={null}
            objectiveId={selection.objectiveId}
            locale={locale}
            noAi={reviewer}
            onDirtyChange={setDirty}
            onSaved={(id) => {
              void loadTree();
              setDirty(false);
              setSelection({ kind: "section", id, objectiveId: selection.objectiveId });
              window.history.replaceState(null, "", `#${toHash({ kind: "section", id, objectiveId: selection.objectiveId })}`);
            }}
          />
        )}
        {selection?.kind === "questions" && <QuestionsPanel key={selection.objectiveId} certId={certId} objectiveId={selection.objectiveId} locale={locale} noAi={reviewer} initialAiAction={selection.ai} onDirtyChange={setDirty} onChanged={() => void loadTree()} />}
        {!reviewer && selection?.kind === "report" && (
          <CourseReport
            certId={certId}
            locale={locale}
            onOpen={(t) => select(t.sectionId ? { kind: "section", id: t.sectionId, objectiveId: t.objectiveId, ai: t.ai } : { kind: "questions", objectiveId: t.objectiveId, ai: t.ai })}
            onObjectiveCreated={() => void loadTree()}
          />
        )}
        {!reviewer && selection?.kind === "overview" && <OverviewEditor key="overview" certId={certId} locale={locale} onDirtyChange={setDirty} />}
        {!reviewer && selection?.kind === "checkpoints" && <Checkpoints certId={certId} locale={locale} onRestored={() => void loadTree()} />}
      </div>
    </div>
    </>
  );
}

type Checkpoint = { id: string; name: string; createdAt: string; author: string | null; authorEmail: string | null; items: number };

/** Ganzen Kurs unter einem Namen merken und darauf zurücksetzen. */
function Checkpoints({ certId, locale, onRestored }: { certId: string; locale: Lang; onRestored: () => void }) {
  const [confirm, confirmDialog] = useConfirm();
  const tr = useTr(locale);
  const [list, setList] = React.useState<Checkpoint[] | null>(null);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const load = React.useCallback(async () => {
    const r = await api<{ checkpoints: Checkpoint[] }>(`/api/admin/certifications/${certId}/workshop/checkpoints`);
    if (r.ok) setList(r.data.checkpoints);
    else setMsg({ ok: false, text: r.error });
  }, [certId]);
  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ sections: number; questions: number }>(`/api/admin/certifications/${certId}/workshop/checkpoints`, { method: "POST", body: { name } });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setName("");
    setMsg({ ok: true, text: tr(`Gemerkt: ${r.data.sections} Lektionen und ${r.data.questions} Fragen.`, `Saved: ${r.data.sections} lessons and ${r.data.questions} questions.`) });
    await load();
  }

  async function restore(cp: Checkpoint) {
    if (!(await confirm(tr(`Ganzen Kurs auf „${cp.name}“ zurücksetzen? Jede geänderte Lektion und Frage behält ihren jetzigen Stand in den Versionen.`, `Restore the whole course to “${cp.name}”? Every changed lesson and question keeps its current version in the history.`)))) return;
    setBusy(true);
    const r = await api<{ restored: number; unchanged: number; missing: number }>(`/api/admin/certifications/${certId}/workshop/checkpoints/${cp.id}/restore`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    const { restored, unchanged, missing } = r.data;
    setMsg({ ok: true, text: tr(`Zurückgesetzt: ${restored} geändert, ${unchanged} schon gleich${missing ? `, ${missing} gibt es nicht mehr` : ""}. Seitdem neu angelegte Lektionen und Fragen bleiben bestehen.`, `Restored: ${restored} changed, ${unchanged} already equal${missing ? `, ${missing} no longer exist` : ""}. Lessons and questions created since then stay.`) });
    onRestored();
  }

  return (
    <>
    {confirmDialog}
    <div className="flex flex-col gap-4" data-testid="checkpoints">
      <div>
        <h2 className="text-lg font-semibold">{tr("Gemerkte Stände", "Saved checkpoints")}</h2>
        <p className="mt-1 text-sm text-subtle">{tr("Sichert alle Lektionen und Fragen des Kurses, z. B. vor einer größeren Überarbeitung. Zurücksetzen ist jederzeit möglich.", "Saves all lessons and questions of the course, e.g. before a larger revision. You can restore it at any time.")}</p>
      </div>
      <form onSubmit={create} className="flex flex-wrap gap-2">
        <input className={cn(inputCls, "max-w-md flex-1")} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("z. B. vor KI-Überarbeitung Oktober", "e.g. before AI revision October")} maxLength={120} required data-testid="checkpoint-name" />
        <Button type="submit" disabled={busy || !name.trim()} iconLeft={<Bookmark className="h-4 w-4" aria-hidden="true" />} data-testid="checkpoint-create">
          {tr("Aktuellen Stand merken", "Save current state")}
        </Button>
      </form>
      {msg && <p className={cn("rounded-xl border p-3 text-sm", msg.ok ? "border-mint-border bg-mint-soft text-mint-text" : "border-danger/40 bg-danger-soft text-danger-text")} role="status">{msg.text}</p>}
      {list?.length === 0 && <p className="text-sm text-subtle">{tr("Noch keine gemerkten Stände.", "No checkpoints yet.")}</p>}
      <ul className="flex flex-col gap-2">
        {list?.map((cp) => (
          <li key={cp.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3" data-testid="checkpoint-item">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{cp.name}</p>
              <p className="text-xs text-subtle">
                {formatDate(cp.createdAt, locale)} · {cp.items} {tr("Inhalte", "items")}
                {cp.author || cp.authorEmail ? ` · ${cp.author ?? cp.authorEmail}` : ""}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void restore(cp)} disabled={busy} iconLeft={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />} data-testid="checkpoint-restore">
              {tr("Zurücksetzen", "Restore")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
    </>
  );
}
