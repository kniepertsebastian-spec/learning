"use client";

import { Download, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StatTile } from "@/components/ui/stat-tile";
import { SegmentedControl } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";

type Status = "valid" | "expiring" | "expired";
export type RegCert = { id: string; person: string; email: string; title: string; vendor: string; earnedAt: string; expiresAt: string | null; status: Status };
export type RegVoucher = { id: string; certification: string; assignedTo: string | null; expiresAt: string; redeemedAt: string | null; note: string; state: "redeemed" | "assigned" | "unassigned" | "expiring" | "expired"; hasCode: boolean };
export type RegPlanned = { id: string; person: string; certification: string; scheduledAt: string };
export type RegMonth = { key: string; label: string; count: number; soon: boolean };
const field = "w-full rounded-md border border-border-strong bg-control px-3 py-2 text-sm";

export function CertificateRegister({
  certs, vouchers, planned, stats, months, members, courses, canEdit,
}: {
  certs: RegCert[]; vouchers: RegVoucher[]; planned: RegPlanned[];
  stats: { valid: number; people: number; expiring: number; expired: number; openVouchers: number; vouchersSoon: number };
  months: RegMonth[]; members: Array<{ userId: string; label: string }>; courses: Array<{ id: string; name: string }>; canEdit: boolean;
}) {
  const { locale, t } = useLocale();
  const r = t.register;
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "soon" | "expired">("all");
  const [adding, setAdding] = useState(false);
  const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" }) : t.certs.unlimited);
  const shown = certs.filter((c) => filter === "all" || (filter === "soon" ? c.status === "expiring" : c.status === "expired"));
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  const badge = (s: Status) => (s === "expired" ? <Badge tone="danger">{t.certs.statusExpired}</Badge> : s === "expiring" ? <Badge tone="warning">{t.certs.statusExpiring}</Badge> : <Badge tone="mint">{t.certs.statusValid}</Badge>);
  const columns: Column<RegCert>[] = [
    { key: "p", header: r.colPerson, render: (c) => <span className="flex items-center gap-2.5"><Avatar name={c.person} size="sm" /><span className="min-w-0 truncate">{c.person}</span></span> },
    { key: "c", header: r.colCert, render: (c) => <span><span className="block">{c.title}</span>{c.vendor && <span className="text-xs text-faint">{c.vendor}</span>}</span> },
    { key: "e", header: r.colEarned, render: (c) => d(c.earnedAt) },
    { key: "u", header: r.colUntil, render: (c) => <span className={cn(c.status === "expired" && "text-danger-text", c.status === "expiring" && "text-warning-text")}>{d(c.expiresAt)}</span> },
    { key: "s", header: r.colStatus, render: (c) => badge(c.status) },
  ];

  const voucherText = (v: RegVoucher) =>
    v.state === "redeemed" ? r.vRedeemed : v.state === "expired" ? r.vExpired : v.state === "expiring" ? fmt(r.vExpiring, { date: d(v.expiresAt) }) : v.state === "assigned" ? r.vAssigned : r.vUnassigned;

  async function removeVoucher(id: string) {
    await fetch(`/api/company/vouchers/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="certificate-register">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold tracking-overline text-link uppercase">{r.overline}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="secondary" onClick={() => setAdding(true)} data-testid="add-voucher">{r.addVoucher}</Button>}
          <Button asChild iconLeft={<Download className="h-4 w-4" aria-hidden="true" />}><a href="/api/company/certificates/export" data-testid="export-csv">{r.export} · {r.exportCsv}</a></Button>
          <Button asChild variant="secondary"><a href="/api/company/certificates/export?format=pdf" data-testid="export-pdf">{r.exportPdf}</a></Button>
        </div>
      </header>

      <div className="flex items-center gap-3 rounded-2xl border border-mint-border bg-mint-soft px-4 py-3 text-sm" data-testid="register-privacy">
        <ShieldCheck className="h-5 w-5 shrink-0 text-mint-text" aria-hidden="true" />
        <p><strong>{r.privacyStrong}</strong> {r.privacyText}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="register-stats">
        <StatTile label={r.statValid} value={stats.valid} sub={fmt(r.statValidSub, { n: stats.people })} subTone="accent" />
        <StatTile label={r.statExpiring} value={stats.expiring} subTone="warning" sub={stats.expiring > 0 ? t.certs.statusExpiring : undefined} />
        <StatTile label={r.statExpired} value={stats.expired} subTone="danger" sub={stats.expired > 0 ? t.certs.statusExpired : undefined} />
        <StatTile label={r.statVouchers} value={stats.openVouchers} sub={fmt(r.statVouchersSub, { n: stats.vouchersSoon })} subTone="warning" />
      </div>

      <Card aria-label={r.months}>
        <h2 className="mb-3 text-base font-semibold">{r.months}</h2>
        <ul className="flex h-28 items-end gap-2" role="img" aria-label={months.map((m) => `${m.key}: ${m.count}`).join(", ")}>
          {months.map((m) => (
            <li key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-2xs tabular-nums text-subtle">{m.count > 0 ? m.count : ""}</span>
              <span className="flex h-16 w-full items-end rounded-md bg-track"><span className={cn("w-full rounded-md", m.soon ? "bg-warning" : "bg-subtle")} style={{ height: `${m.count === 0 ? 0 : Math.max(10, Math.round((m.count / maxMonth) * 100))}%` }} /></span>
              <span className="text-[10px] text-faint">{new Date(m.label).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { month: "short", timeZone: "UTC" })}</span>
            </li>
          ))}
        </ul>
      </Card>

      <section aria-label={r.table}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{r.table}</h2>
          <SegmentedControl value={filter} onChange={setFilter} label={r.table} options={[{ value: "all", label: r.filterAll }, { value: "soon", label: r.filterSoon }, { value: "expired", label: r.filterExpired }]} />
        </div>
        <DataTable columns={columns} rows={shown} rowKey={(c) => c.id} caption={r.table} empty={r.none} stackOnMobile />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label={r.vouchers}>
          <h2 className="mb-3 text-lg font-semibold">{r.vouchers}</h2>
          {vouchers.length === 0 ? <p className="text-sm text-subtle">{r.noVouchers}</p> : (
            <ul className="flex flex-col gap-2">
              {vouchers.map((v) => (
                <li key={v.id}>
                  <Card className="flex flex-wrap items-center gap-3 p-4" data-testid={`reg-voucher-${v.id}`}>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="font-semibold">{v.certification}</p>
                      <p className="text-xs text-subtle">{v.assignedTo ?? r.unassigned}{v.hasCode ? ` · ${r.hasCode}` : ""}</p>
                    </div>
                    <Badge tone={v.state === "redeemed" ? "mint" : v.state === "expiring" ? "warning" : v.state === "expired" ? "danger" : "neutral"}>{voucherText(v)}</Badge>
                    {canEdit && <Button variant="ghost" size="sm" onClick={() => void removeVoucher(v.id)}>{r.remove}</Button>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label={r.planned}>
          <h2 className="mb-3 text-lg font-semibold">{r.planned}</h2>
          {planned.length === 0 ? <p className="text-sm text-subtle">{r.noPlanned}</p> : (
            <ul className="flex flex-col gap-2">
              {planned.map((p) => (
                <li key={p.id}><Card className="flex items-center justify-between gap-3 p-4"><span><span className="block font-semibold">{p.certification}</span><span className="text-xs text-subtle">{p.person}</span></span><Badge tone="info">{d(p.scheduledAt)}</Badge></Card></li>
              ))}
            </ul>
          )}
          {planned.length > 0 && <Button asChild variant="secondary" size="sm" className="mt-3"><a href="/api/company/certificates/calendar">{r.teamCalendar}</a></Button>}
        </section>
      </div>

      {adding && <VoucherDialog members={members} courses={courses} onClose={() => setAdding(false)} />}
    </div>
  );
}

function VoucherDialog({ members, courses, onClose }: { members: Array<{ userId: string; label: string }>; courses: Array<{ id: string; name: string }>; onClose: () => void }) {
  const { t } = useLocale();
  const r = t.register;
  const router = useRouter();
  const [course, setCourse] = useState("");
  const [person, setPerson] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!course) return setError(r.noCourse);
    const res = await fetch("/api/company/vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ certificationId: course, assignedUserId: person || null, expiresAt: expires, note, code: code || null }) });
    if (!res.ok) return setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? r.failed);
    onClose();
    router.refresh();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent closeLabel={r.close} data-testid="voucher-dialog">
        <DialogTitle>{r.addVoucher}</DialogTitle>
        <DialogDescription className="sr-only">{r.vouchers}</DialogDescription>
        <div className="mt-4 space-y-3">
          <label className="block text-sm"><span className="mb-1 block font-medium">{r.fCourse}</span><select value={course} onChange={(e) => setCourse(e.target.value)} className={field} data-testid="voucher-course"><option value="">–</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{r.fPerson}</span><select value={person} onChange={(e) => setPerson(e.target.value)} className={field}><option value="">{r.unassigned}</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.label}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{r.fExpires}</span><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={field} data-testid="voucher-expires" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{r.fNote}</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={field} /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{r.fCode}</span><input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" className={field} data-testid="voucher-code-input" /></label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{r.cancel}</Button><Button onClick={() => void save()} disabled={!expires} data-testid="voucher-save">{r.save}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
