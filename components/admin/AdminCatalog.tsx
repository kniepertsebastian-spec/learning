"use client";

import { ArrowRight, ChevronDown, ChevronUp, Languages, MoreHorizontal, Plus, Sparkles, Tags } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createCertificationAction } from "@/app/admin/actions";
import { JobBar } from "@/components/admin/JobBar";
import { TranslationProgress } from "@/components/admin/TranslationProgress";
import { CourseGenerationPanel } from "@/components/CourseGenerationPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import { SegmentedControl } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { CourseCategoryColor } from "@/lib/server/db/schema";

export interface CatalogCert {
  id: string;
  slug: string;
  name: string;
  provider: string;
  examVersion: string;
  courseType: "certification" | "custom";
  categoryId: string | null;
  /** Alle Gruppen, Hauptgruppe zuerst. */
  categoryIds: string[];
  shortCode: string | null;
  /** Kurssprache und Stand der Übersetzung in die zweite Sprache; "interrupted" = Lauf durch Neustart verloren. */
  translation: {
    contentLocale: "de" | "en";
    status: "none" | "running" | "done" | "failed" | "interrupted";
    message: string | null;
    /** Bearbeitete Teile (übersetzt oder fehlgeschlagen) von allen; total 0 = noch nicht gezählt. */
    processed: number;
    total: number;
  };
  stats: { domains: number; lessons: number; questions: number };
}
export interface CatalogGroup {
  id: string;
  name: { de: string; en: string };
  color: CourseCategoryColor;
}

const DOT: Record<CourseCategoryColor, string> = { info: "bg-info", mint: "bg-mint", warning: "bg-warning", danger: "bg-danger", violet: "bg-violet" };
const TILE: Record<CourseCategoryColor, string> = { info: "bg-info-soft text-info-text", mint: "bg-mint-soft text-mint-text", warning: "bg-warning-soft text-warning-text", danger: "bg-danger-soft text-danger-text", violet: "bg-surface-2 text-violet" };
const COLORS: CourseCategoryColor[] = ["info", "mint", "warning", "danger", "violet"];
const fieldClass = "w-full rounded-md border border-border-strong bg-control px-3 py-2 text-sm";
/** So viele Kurse je Gruppe zeigt die Liste zuerst; der Rest kommt per „weitere anzeigen“. */
const PAGE = 25;
type StatusFilter = "all" | "ready" | "missing" | "translation";

function matchesStatus(c: CatalogCert, status: StatusFilter): boolean {
  if (status === "ready") return c.stats.lessons > 0;
  if (status === "missing") return c.stats.lessons === 0;
  if (status === "translation") return c.stats.lessons > 0 && c.translation.status !== "done";
  return true;
}

async function api(url: string, method: string, body?: unknown): Promise<Response> {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function AdminCatalog({
  certs,
  groups,
  totals,
  openRequests,
  openReports,
  aiCostMonthUsd,
}: {
  certs: CatalogCert[];
  groups: CatalogGroup[];
  totals: { lessons: number; questions: number };
  openRequests: number;
  openReports: number;
  aiCostMonthUsd: number;
}) {
  const { locale, t } = useLocale();
  const ac = t.admin_catalog;
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showEmptyGroups, setShowEmptyGroups] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [pick, setPick] = useState<CatalogCert | null>(null);
  const [dialog, setDialog] = useState<null | { kind: "new" } | { kind: "rename"; group: CatalogGroup } | { kind: "order" }>(null);

  const colorLabel: Record<CourseCategoryColor, string> = { info: ac.colorInfo, mint: ac.colorMint, warning: ac.colorWarning, danger: ac.colorDanger, violet: ac.colorViolet };
  const q = query.trim().toLowerCase();
  // Suche und Status gelten überall; die Gruppenzahlen an den Chips zählen den ganzen Katalog.
  const shown = useMemo(
    () => certs.filter((c) => matchesStatus(c, status) && (!q || [c.name, c.slug, c.provider, c.examVersion].some((v) => v.toLowerCase().includes(q)))),
    [certs, status, q],
  );
  const inGroup = (list: CatalogCert[], id: string | null) => list.filter((c) => (id === null ? c.categoryIds.length === 0 : c.categoryIds.includes(id)));
  const byGroup = (id: string | null) => inGroup(certs, id);
  const emptyGroups = groups.filter((g) => byGroup(g.id).length === 0);
  const unassigned = byGroup(null);
  const visibleGroups = filter === "all" ? groups : groups.filter((g) => g.id === filter);
  const showUnassigned = unassigned.length > 0 && (filter === "all" || filter === "none");
  const translating = certs.some((c) => c.translation.status === "running");

  // Fortschritt laufender Übersetzungen nachladen, solange eine läuft.
  useEffect(() => {
    if (!translating) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [translating, router]);

  async function move(cert: CatalogCert, categoryIds: string[], silent = false) {
    const before = cert.categoryIds;
    const res = await api(`/api/admin/certifications/${cert.id}/category`, "PUT", { categoryIds });
    if (!res.ok) {
      toast.error(ac.moveFailed);
      return;
    }
    router.refresh();
    if (silent) return;
    const names = categoryIds.map((id) => groups.find((g) => g.id === id)?.name[locale]).filter(Boolean).join(", ");
    toast(fmt(ac.moved, { name: cert.name, group: names || ac.unassigned }), {
      action: { label: ac.undo, onClick: () => void move({ ...cert, categoryIds }, before, true) },
    });
  }

  return (
    <div className="flex flex-1 flex-col" data-testid="admin-catalog">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ac.title}</h1>
          <p className="mt-1 text-sm text-subtle">{fmt(ac.summary, { n: certs.length, g: groups.length, l: totals.lessons, q: totals.questions })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setManualOpen(true)} data-testid="open-manual">{ac.createManual}</Button>
          <Button variant="inverted" onClick={() => setWizardOpen(true)} iconLeft={<Sparkles className="h-4 w-4" aria-hidden="true" />} data-testid="open-wizard">{ac.generate}</Button>
        </div>
      </header>

      <JobBar />

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label={ac.group} data-testid="group-chips">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>{ac.all} <span className="text-faint">{certs.length}</span></Chip>
        {groups.filter((g) => showEmptyGroups || filter === g.id || byGroup(g.id).length > 0).map((g) => (
          <Chip key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>
            <span className={cn("h-2 w-2 rounded-full", DOT[g.color])} aria-hidden="true" />
            {g.name[locale]} <span className="text-faint">{byGroup(g.id).length}</span>
          </Chip>
        ))}
        {unassigned.length > 0 && (
          <Chip active={filter === "none"} onClick={() => setFilter("none")}>{ac.unassigned} <span className="text-faint">{unassigned.length}</span></Chip>
        )}
        {emptyGroups.length > 0 && (
          <button type="button" onClick={() => setShowEmptyGroups((v) => !v)} aria-expanded={showEmptyGroups} className="flex min-h-9 items-center px-2 text-meta text-subtle underline-offset-2 hover:text-foreground hover:underline">
            {showEmptyGroups ? ac.emptyGroupsHide : fmt(ac.emptyGroupsShow, { n: emptyGroups.length })}
          </button>
        )}
        <button type="button" onClick={() => setDialog({ kind: "new" })} data-testid="new-group" className="flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 text-meta text-subtle hover:text-foreground">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />{ac.newGroup}
        </button>
      </div>

      {certs.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ac.searchPlaceholder} aria-label={ac.searchLabel} shortcutHint={false} className="sm:max-w-sm" data-testid="catalog-search" />
          <SegmentedControl<StatusFilter>
            value={status}
            onChange={setStatus}
            label={ac.filterLabel}
            options={[
              { value: "all", label: ac.filterAll },
              { value: "ready", label: ac.filterReady },
              { value: "missing", label: ac.filterMissing },
              { value: "translation", label: ac.filterTranslation },
            ]}
          />
          {(q || status !== "all") && <p className="text-meta text-subtle sm:ml-auto" aria-live="polite">{fmt(ac.matchCount, { n: shown.length, total: certs.length })}</p>}
        </div>
      )}

      {certs.length === 0 ? (
        <EmptyState title={ac.emptyTitle} description={ac.emptyBody} />
      ) : shown.length === 0 ? (
        <EmptyState title={ac.noMatch} />
      ) : (
        <div className="flex flex-col gap-6">
          {visibleGroups.map((g) => {
            const list = inGroup(shown, g.id);
            // In „Alle“ (und bei Suche/Status) erscheinen nur Gruppen mit Treffern; leere sind über ihren Filter erreichbar.
            if ((filter === "all" || q || status !== "all") && list.length === 0) return null;
            return (
              <section key={g.id} aria-label={g.name[locale]} data-testid={`group-${g.id}`}>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold", TILE[g.color])} aria-hidden="true">{g.name[locale].slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold">{g.name[locale]}</h2>
                    <p className="text-xs text-subtle">{fmt(ac.groupCount, { n: list.length, q: list.reduce((n, c) => n + c.stats.questions, 0) })}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "rename", group: g })}>{ac.rename}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "order" })}>{ac.reorder}</Button>
                </div>
                <CertRows list={list} groups={groups} onEdit={setPick} />
              </section>
            );
          })}
          {showUnassigned && inGroup(shown, null).length > 0 && (
            <section aria-label={ac.unassigned} data-testid="group-none">
              <h2 className="mb-2 text-base font-semibold">{ac.unassigned}</h2>
              <CertRows list={inGroup(shown, null)} groups={groups} onEdit={setPick} />
            </section>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link href="/admin/requests" data-testid="admin-requests-link" className="rounded-2xl border border-border bg-surface p-4 hover:border-border-strong">
          <p className="text-meta text-subtle">{ac.requests}</p>
          <p className="mt-1 text-stat font-semibold tabular-nums">{openRequests}</p>
          <p className="text-xs text-faint">{fmt(ac.requestsOpen, { n: openRequests })}</p>
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-meta text-subtle">{ac.reports}</p>
          <p className="mt-1 text-stat font-semibold tabular-nums">{openReports}</p>
          <p className="text-xs text-faint">{fmt(ac.requestsOpen, { n: openReports })}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-meta text-subtle">{ac.cost}</p>
          <p className="mt-1 text-stat font-semibold tabular-nums">$ {aiCostMonthUsd.toFixed(2)}</p>
        </div>
      </div>

      <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
        <SheetContent closeLabel={t.quiz.close} className="w-[min(420px,100vw)]">
          <SheetTitle>{ac.wizTitle}</SheetTitle>
          <SheetDescription>{ac.wizIntro}</SheetDescription>
          <div className="mt-4"><CourseGenerationPanel locale={locale} categories={groups} bare /></div>
        </SheetContent>
      </Sheet>

      <Sheet open={manualOpen} onOpenChange={setManualOpen}>
        <SheetContent closeLabel={t.quiz.close} className="w-[min(420px,100vw)]">
          <SheetTitle>{ac.manualTitle}</SheetTitle>
          <SheetDescription>{ac.manualIntro}</SheetDescription>
          <form action={createCertificationAction} className="mt-4 space-y-3">
            <label className="block text-sm"><span className="mb-1 block font-medium">Name</span><input name="name" required placeholder="CompTIA Network+" className={fieldClass} /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Slug</span><input name="slug" required placeholder="network-plus-n10-009" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={cn(fieldClass, "font-mono")} /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">{ac.fieldProvider}</span><input name="provider" required placeholder="CompTIA" className={fieldClass} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm"><span className="mb-1 block font-medium">Exam</span><input name="examName" required placeholder="Network+" className={fieldClass} /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium">{ac.fieldVersion.split(" ").pop()}</span><input name="examVersion" required placeholder="N10-009" className={fieldClass} /></label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Domains <span className="font-normal text-faint">Name | %</span></span>
              <textarea name="domains" required rows={5} placeholder={"Networking Concepts | 23\nNetwork Security | 20"} className={cn(fieldClass, "font-mono")} />
            </label>
            <Button type="submit" className="w-full">{ac.manualCreate}</Button>
          </form>
        </SheetContent>
      </Sheet>

      <GroupPicker cert={pick} groups={groups} onClose={() => setPick(null)} onSave={(c, ids) => { setPick(null); void move(c, ids); }} />
      <GroupDialogs dialog={dialog} onClose={() => setDialog(null)} groups={groups} colorLabel={colorLabel} />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-meta font-medium", active ? "border-foreground bg-surface-2 text-foreground" : "border-border-strong text-muted hover:text-foreground")}>
      {children}
    </button>
  );
}

function CertRows({ list, groups, onEdit }: { list: CatalogCert[]; groups: CatalogGroup[]; onEdit: (c: CatalogCert) => void }) {
  const { locale, t } = useLocale();
  const ac = t.admin_catalog;
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  async function translate(c: CatalogCert) {
    setStarting(c.id);
    try {
      const res = await api(`/api/admin/certifications/${c.id}/translate`, "POST");
      if (!res.ok) throw new Error();
      toast.success(fmt(ac.translateStarted, { name: c.name }));
      router.refresh();
    } catch {
      toast.error(ac.translateFailed);
    } finally {
      setStarting(null);
    }
  }
  if (list.length === 0) return <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-faint">—</p>;
  return (
    <>
    <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
      {list.slice(0, limit).map((c) => {
        const ready = c.stats.lessons > 0;
        return (
          <li key={c.id}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-4 py-3 last:border-0" data-testid={`cert-row-${c.slug}`}>
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{c.name}</p>
                  <Badge tone={ready ? "mint" : "warning"}>{ready ? ac.statusReady : ac.statusMissing}</Badge>
                  {c.courseType === "custom" && <Badge tone="info">{ac.typeCustom}</Badge>}
                  <TranslationBadge cert={c} />
                </div>
                <p className="mt-0.5 text-xs text-faint"><span className="font-mono text-subtle">{c.provider} · {c.examVersion}</span> · {fmt(ac.stats, { d: c.stats.domains, l: c.stats.lessons, q: c.stats.questions })}</p>
                {c.translation.status === "running" && <TranslationProgress cert={c} />}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-subtle" data-testid={`groups-${c.slug}`}>
                {c.categoryIds.length === 0 ? <span>{ac.unassigned}</span> : c.categoryIds.map((id, i) => {
                  const g = groups.find((x) => x.id === id);
                  return g ? <span key={id} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", TILE[g.color])} title={i === 0 ? ac.mainGroup : undefined}>{g.name[locale]}{i === 0 && c.categoryIds.length > 1 ? " ★" : ""}</span> : null;
                })}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label={fmt(ac.moreActions, { name: c.name })} data-testid={`cert-actions-${c.slug}`} className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-control hover:bg-surface-2">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEdit(c)} data-testid={`group-edit-${c.slug}`}>
                    <Tags className="h-4 w-4" aria-hidden="true" />{ac.editGroups}
                  </DropdownMenuItem>
                  {ready && c.translation.status !== "done" && c.translation.status !== "running" && (
                    <DropdownMenuItem onSelect={() => void translate(c)} disabled={starting === c.id} title={c.translation.message ?? undefined} data-testid={`translate-${c.slug}`}>
                      <Languages className="h-4 w-4" aria-hidden="true" />
                      {c.translation.status === "none" ? fmt(ac.translateTo, { lang: c.translation.contentLocale === "en" ? ac.langDe : ac.langEn }) : ac.translateRetry}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/admin/certifications/${c.slug}`}>{ac.open}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
    {list.length > limit && (
      <Button variant="ghost" size="sm" className="mt-2 self-start" onClick={() => setLimit((n) => n + PAGE)}>
        {fmt(ac.showMore, { n: Math.min(PAGE, list.length - limit) })}
      </Button>
    )}
    </>
  );
}

/** Stand der Übersetzung: zweisprachig, läuft (mit Fortschritt) oder unvollständig. Ohne Lauf nichts. */
function TranslationBadge({ cert }: { cert: CatalogCert }) {
  const ac = useLocale().t.admin_catalog;
  const { status, message } = cert.translation;
  if (status === "none") return null;
  const label = { done: ac.translationDone, running: ac.translationRunning, failed: ac.translationFailed, interrupted: ac.translationInterrupted }[status];
  const tone = status === "done" ? "mint" : status === "running" ? "info" : "warning";
  return (
    <Badge tone={tone} title={message ?? undefined} data-testid={`translation-${cert.slug}`}>
      {label}
    </Badge>
  );
}

function GroupPicker({ cert, groups, onClose, onSave }: { cert: CatalogCert | null; groups: CatalogGroup[]; onClose: () => void; onSave: (c: CatalogCert, ids: string[]) => void }) {
  const { locale, t } = useLocale();
  const ac = t.admin_catalog;
  const [ids, setIds] = useState<string[]>([]);
  const [lastKey, setLastKey] = useState("");
  const key = cert?.id ?? "";
  if (key !== lastKey) {
    setLastKey(key);
    setIds(cert?.categoryIds ?? []);
  }
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <Dialog open={cert !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={t.quiz.close}>
        <DialogTitle>{cert ? fmt(ac.editGroupsFor, { name: cert.name }) : ac.editGroups}</DialogTitle>
        <DialogDescription>{ac.groupsHelp}</DialogDescription>
        <ul className="mt-4 flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto" data-testid="group-picker">
          {groups.map((g) => {
            const on = ids.includes(g.id);
            const main = ids[0] === g.id;
            return (
              <li key={g.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-3 py-2 text-sm">
                <label className="flex min-h-9 flex-1 items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => toggle(g.id)} data-testid={`pick-${g.id}`} className="h-4 w-4" />
                  <span className={cn("h-2 w-2 rounded-full", DOT[g.color])} aria-hidden="true" />
                  {g.name[locale]}
                </label>
                {main ? <Badge tone="mint">{ac.mainGroup}</Badge> : on ? <Button variant="ghost" size="sm" onClick={() => setIds((cur) => [g.id, ...cur.filter((x) => x !== g.id)])}>{ac.makeMain}</Button> : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{ac.cancel}</Button>
          <Button onClick={() => cert && onSave(cert, ids)} data-testid="group-pick-save">{ac.save}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupDialogs({ dialog, onClose, groups, colorLabel }: { dialog: null | { kind: "new" } | { kind: "rename"; group: CatalogGroup } | { kind: "order" }; onClose: () => void; groups: CatalogGroup[]; colorLabel: Record<CourseCategoryColor, string> }) {
  const { t } = useLocale();
  const ac = t.admin_catalog;
  const router = useRouter();
  const [de, setDe] = useState("");
  const [en, setEn] = useState("");
  const [color, setColor] = useState<CourseCategoryColor>("info");
  const [order, setOrder] = useState<string[]>(groups.map((g) => g.id));
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string>("");

  // Beim Öffnen die Felder neu befüllen.
  const key = dialog ? (dialog.kind === "rename" ? `rename-${dialog.group.id}` : dialog.kind) : "";
  if (key !== lastKey) {
    setLastKey(key);
    setError(null);
    if (dialog?.kind === "rename") { setDe(dialog.group.name.de); setEn(dialog.group.name.en); }
    if (dialog?.kind === "new") { setDe(""); setEn(""); setColor("info"); }
    if (dialog?.kind === "order") setOrder(groups.map((g) => g.id));
  }

  async function save() {
    setError(null);
    let res: Response | null = null;
    if (dialog?.kind === "new") res = await api("/api/admin/course-categories", "POST", { name: { de, en }, color });
    if (dialog?.kind === "rename") res = await api(`/api/admin/course-categories/${dialog.group.id}`, "PATCH", { name: { de, en } });
    if (dialog?.kind === "order") res = await api("/api/admin/course-categories", "PUT", { ids: order });
    if (!res || !res.ok) {
      setError(ac.moveFailed);
      return;
    }
    onClose();
    router.refresh();
  }

  const nameOf = (id: string) => groups.find((g) => g.id === id)?.name;
  return (
    <Dialog open={dialog !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={t.quiz.close}>
        <DialogTitle>{dialog?.kind === "order" ? ac.reorder : dialog?.kind === "rename" ? ac.rename : ac.newGroup}</DialogTitle>
        <DialogDescription className="sr-only">{ac.groupName}</DialogDescription>
        {dialog?.kind === "order" ? (
          <ol className="mt-4 flex flex-col gap-1.5">
            {order.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-3 py-2 text-sm">
                <span className="flex-1">{nameOf(id)?.de} / {nameOf(id)?.en}</span>
                <button type="button" aria-label={ac.up} disabled={i === 0} onClick={() => setOrder((o) => { const n = [...o]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-30"><ChevronUp className="h-4 w-4" aria-hidden="true" /></button>
                <button type="button" aria-label={ac.down} disabled={i === order.length - 1} onClick={() => setOrder((o) => { const n = [...o]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-30"><ChevronDown className="h-4 w-4" aria-hidden="true" /></button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm"><span className="mb-1 block font-medium">{ac.nameDe}</span><input value={de} onChange={(e) => setDe(e.target.value)} className={fieldClass} data-testid="group-name-de" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">{ac.nameEn}</span><input value={en} onChange={(e) => setEn(e.target.value)} className={fieldClass} data-testid="group-name-en" /></label>
            {dialog?.kind === "new" && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium">{ac.color}</legend>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c} className={cn("flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-meta", color === c ? "border-foreground" : "border-border-strong")}>
                      <span className={cn("h-2.5 w-2.5 rounded-full", DOT[c])} aria-hidden="true" />{colorLabel[c]}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{ac.cancel}</Button>
          <Button onClick={() => void save()} data-testid="group-save">{dialog?.kind === "order" ? ac.saveOrder : ac.save}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
