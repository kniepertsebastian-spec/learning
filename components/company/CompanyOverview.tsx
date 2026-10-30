"use client";

import { Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AssignDialog, type AssignGroup, type AssignMember, type AssignPath } from "@/components/company/AssignDialog";
import { GroupDialog, GROUP_DOT, type EditableGroup } from "@/components/company/GroupDialog";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Overline } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/progress";
import { SearchField } from "@/components/ui/search-field";
import { StatTile } from "@/components/ui/stat-tile";
import { SegmentedControl } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { CourseCategoryColor } from "@/lib/server/db/schema";

export type OverviewRow = {
  id: string;
  memberName: string | null;
  memberEmail: string;
  learningPath: string;
  status: "assigned" | "in_progress" | "completed";
  dueAt: string | null;
  completedAt: string | null;
  overdue: boolean;
};
export type OverviewGroup = { id: string; name: { de: string; en: string }; color: CourseCategoryColor; items: Array<{ certificationId: string; name: string; kind: "catalog" | "internal" | "mandatory" }>; people: string[] };
export type OverviewRule = { id: string; learningPath: string; assigned: number; completed: number; overdue: number; dueInDays: number };
export type OverviewInvite = { id: string; email: string; daysAgo: number };

const CHIP_DOT = { catalog: "bg-info", internal: "bg-warning", mandatory: "bg-danger" } as const;

function fmtDate(iso: string | null, locale: "de" | "en") {
  return iso ? new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" }) : "–";
}

export function CompanyOverview({
  rows,
  members,
  paths,
  groups,
  rules,
  invites,
  canAssign,
  isAdmin,
  totals,
}: {
  rows: OverviewRow[];
  members: AssignMember[];
  paths: AssignPath[];
  groups: OverviewGroup[];
  rules: OverviewRule[];
  /** null für Rollen ohne Einladungsrechte */
  invites: OverviewInvite[] | null;
  canAssign: boolean;
  isAdmin: boolean;
  totals: { members: number; activePaths: number; certifications: number; overdue: number; completionRate: number | null };
}) {
  const { locale, t } = useLocale();
  const o = t.company_overview;
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "overdue" | "done">("all");
  const [query, setQuery] = useState("");
  const [assignOpen, setAssignOpen] = useState<{ groupId: string | null } | null>(null);
  const [groupEdit, setGroupEdit] = useState<{ group: EditableGroup | null } | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [manage, setManage] = useState<OverviewRow | null>(null);
  const [due, setDue] = useState("");
  const [manageError, setManageError] = useState<string | null>(null);

  const shown = rows.filter((r) => {
    if (filter === "overdue" && !r.overdue) return false;
    if (filter === "done" && r.status !== "completed") return false;
    const q = query.trim().toLowerCase();
    return !q || `${r.memberName ?? ""} ${r.memberEmail}`.toLowerCase().includes(q);
  });

  const statusPill = (r: OverviewRow) =>
    r.status === "completed" ? <Badge tone="mint">{o.stDone}</Badge> : r.overdue ? <Badge tone="danger">{o.stOverdue}</Badge> : r.status === "in_progress" ? <Badge tone="info">{o.stProgress}</Badge> : <Badge tone="neutral">{o.stOpen}</Badge>;

  const columns: Column<OverviewRow>[] = [
    { key: "p", header: o.colPerson, render: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.memberName ?? r.memberEmail} size="sm" /><span className="min-w-0 truncate">{r.memberName ?? r.memberEmail}</span></span> },
    { key: "c", header: o.colPath, render: (r) => r.learningPath },
    { key: "s", header: o.colStatus, render: statusPill },
    { key: "d", header: o.colDue, render: (r) => <span className={cn(r.overdue && "font-medium text-danger-text")}>{fmtDate(r.dueAt, locale)}</span> },
    { key: "x", header: o.colDone, render: (r) => fmtDate(r.completedAt, locale) },
    ...(canAssign
      ? [{ key: "m", header: "", align: "right" as const, render: (r: OverviewRow) => <Button variant="ghost" size="sm" onClick={() => { setManage(r); setDue(""); setManageError(null); }} aria-label={`${o.manage}: ${r.memberEmail} – ${r.learningPath}`} data-testid="manage-assignment">{o.manage}</Button> }]
      : []),
  ];

  async function changeDue(id: string) {
    const res = await fetch(`/api/company/assignments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueAt: due || null }) });
    if (!res.ok) return setManageError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? o.wizFailed);
    setManage(null);
    router.refresh();
  }
  async function removeRow(id: string) {
    const res = await fetch(`/api/company/assignments/${id}`, { method: "DELETE" });
    if (!res.ok) return setManageError(o.wizFailed);
    setManage(null);
    router.refresh();
  }

  const assignGroups: AssignGroup[] = groups.map((g) => ({ id: g.id, name: g.name, courses: g.items.length }));

  return (
    <div className="flex flex-col gap-6" data-testid="company-overview">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Overline className="text-link">{o.overline}</Overline>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{o.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && <Button asChild variant="secondary"><Link href="/company?tab=team">{o.invite}</Link></Button>}
          {canAssign && <Button onClick={() => setAssignOpen({ groupId: null })} iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />} data-testid="open-assign">{o.assign}</Button>}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-mint-border bg-mint-soft px-4 py-3 text-sm" data-testid="privacy-line">
        <ShieldCheck className="h-5 w-5 shrink-0 text-mint-text" aria-hidden="true" />
        <p className="min-w-0 flex-1"><strong>{o.privacyStrong}</strong> {o.privacyText}</p>
        <button type="button" onClick={() => setPrivacyOpen(true)} className="font-medium text-mint-text hover:underline">{o.learnMore}</button>
      </div>
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent closeLabel={o.close}>
          <DialogTitle>{o.privacyTitle}</DialogTitle>
          <DialogDescription className="mt-2 text-body leading-relaxed text-muted">{o.privacyLong}</DialogDescription>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="company-stats">
        <StatTile label={o.statMembers} value={totals.members} sub={invites ? fmt(o.statMembersSub, { n: invites.length }) : undefined} />
        <StatTile label={o.statActive} value={totals.activePaths} sub={fmt(o.statActiveSub, { n: totals.certifications })} />
        <StatTile label={o.statOverdue} value={totals.overdue} sub={totals.overdue > 0 ? o.statOverdueSub : undefined} subTone="danger" />
        <StatTile label={o.statRate} value={totals.completionRate === null ? "–" : `${totals.completionRate} %`} sub={o.statRateSub} subTone="accent" />
      </div>

      <section aria-label={o.groups}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{o.groups}</h2>
          <ul className="flex flex-wrap gap-3 text-xs text-subtle">
            {(["catalog", "internal", "mandatory"] as const).map((k) => (
              <li key={k} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", CHIP_DOT[k])} aria-hidden="true" />{{ catalog: o.legendCatalog, internal: o.legendInternal, mandatory: o.legendMandatory }[k]}</li>
            ))}
          </ul>
        </div>
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
          {groups.map((g) => (
            <li key={g.id}>
              <Card className="flex h-full flex-col gap-3" data-testid={`cgroup-${g.id}`}>
                <div className="flex items-start gap-3">
                  <span className={cn("mt-0.5 h-8 w-8 shrink-0 rounded-lg", GROUP_DOT[g.color])} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.name[locale]}</p>
                    <p className="text-xs text-subtle">{fmt(o.groupCourses, { n: g.items.length })}</p>
                  </div>
                  {canAssign && <Button variant="ghost" size="sm" onClick={() => setGroupEdit({ group: { id: g.id, name: g.name, color: g.color, certificationIds: g.items.map((i) => i.certificationId) } })}>{o.editGroup}</Button>}
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {g.items.map((i) => (
                    <li key={i.certificationId} className="flex items-center gap-1.5 rounded-full border border-border-strong px-2.5 py-0.5 text-xs"><span className={cn("h-1.5 w-1.5 rounded-full", CHIP_DOT[i.kind])} aria-hidden="true" />{i.name}</li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs text-subtle">
                    {g.people.length > 0 ? <><AvatarStack names={g.people} max={3} size="sm" />{fmt(o.people, { n: g.people.length })}</> : o.noPeople}
                  </span>
                  {canAssign && <Button size="sm" variant="secondary" onClick={() => setAssignOpen({ groupId: g.id })} data-testid={`cgroup-assign-${g.id}`}>{o.assignGroup}</Button>}
                </div>
              </Card>
            </li>
          ))}
          {canAssign && (
            <li>
              <button type="button" onClick={() => setGroupEdit({ group: null })} data-testid="new-company-group" className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border-strong p-5 text-center hover:bg-surface-2">
                <Plus className="h-5 w-5 text-subtle" aria-hidden="true" />
                <span className="font-semibold">{o.newGroup}</span>
                <span className="text-xs text-faint">{o.newGroupHint}</span>
              </button>
            </li>
          )}
        </ul>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label={o.assignments} className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{o.assignments}</h2>
            <SegmentedControl value={filter} onChange={setFilter} label={o.assignments} options={[{ value: "all", label: o.filterAll }, { value: "overdue", label: o.filterOverdue }, { value: "done", label: o.filterDone }]} />
          </div>
          <SearchField shortcutHint={false} placeholder={o.searchPerson} aria-label={o.searchPerson} value={query} onChange={(e) => setQuery(e.target.value)} className="mb-3 max-w-sm" />
          <DataTable columns={columns} rows={shown} rowKey={(r) => r.id} caption={o.assignments} empty={o.noAssignments} />
        </section>

        <aside className="flex flex-col gap-4">
          <Card>
            <h2 className="text-base font-semibold">{o.mandatory}</h2>
            {rules.length === 0 ? (
              <p className="mt-2 text-sm text-subtle">{o.noMandatory}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {rules.map((r) => (
                  <li key={r.id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm"><span className="min-w-0 truncate">{r.learningPath}</span><span className="shrink-0 text-xs tabular-nums text-subtle">{r.completed} / {r.assigned}</span></div>
                    <ProgressBar value={r.assigned ? (r.completed / r.assigned) * 100 : 0} tone={r.overdue > 0 ? "danger" : "mint"} label={r.learningPath} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {invites && (
            <Card>
              <h2 className="text-base font-semibold">{o.openInvites}</h2>
              {invites.length === 0 ? (
                <p className="mt-2 text-sm text-subtle">{o.noInvites}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-3">
                      <Avatar name={i.email} size="sm" dashed />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm">{i.email}</span><span className="text-xs text-faint">{i.daysAgo <= 0 ? o.today : fmt(o.sinceDays, { n: i.daysAgo })}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </aside>
      </div>

      {assignOpen && <AssignDialog key={assignOpen.groupId ?? "none"} open onOpenChange={(v) => !v && setAssignOpen(null)} members={members} paths={paths} groups={assignGroups} initialGroupId={assignOpen.groupId} />}
      {groupEdit && <GroupDialog key={groupEdit.group?.id ?? "new"} open onOpenChange={(v) => !v && setGroupEdit(null)} group={groupEdit.group} paths={paths} />}

      <Dialog open={manage !== null} onOpenChange={(v) => !v && setManage(null)}>
        <DialogContent closeLabel={o.close}>
          <DialogTitle>{o.manageTitle}</DialogTitle>
          <DialogDescription>{manage ? `${manage.memberName ?? manage.memberEmail} · ${manage.learningPath}` : ""}</DialogDescription>
          {manage && (
            <div className="mt-4 space-y-3">
              {manage.status !== "completed" && (
                <div className="flex items-end gap-2">
                  <label className="block flex-1 text-sm"><span className="mb-1 block font-medium">{o.changeDue}</span><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full rounded-md border border-border-strong bg-control px-3 py-2" /></label>
                  <Button variant="secondary" onClick={() => void changeDue(manage.id)}>{o.gSave}</Button>
                </div>
              )}
              {manageError && <p role="alert" className="text-sm text-danger-text">{manageError}</p>}
              {manage.status !== "completed" && <Button variant="ghost" onClick={() => void removeRow(manage.id)} data-testid="remove-assignment">{o.remove}</Button>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
