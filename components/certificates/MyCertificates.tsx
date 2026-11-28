"use client";

import { Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { certStatus, expiryFrom } from "@/lib/certificates/logic";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";

export type MyCert = { id: string; title: string; vendor: string; earnedAt: string; expiresAt: string | null; evidenceUrl: string | null; shared: boolean };
export type MyVoucher = { id: string; certName: string; orgName: string; expiresAt: string; redeemed: boolean; hasCode: boolean; note: string };
export type CatalogOption = { id: string; name: string; provider: string; validityMonths: number | null };

const field = "w-full rounded-md border border-border-strong bg-control px-3 py-2 text-sm";
const day = (iso: string | null, locale: "de" | "en") => (iso ? new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" }) : null);

export function MyCertificates({ certs, vouchers, catalog, companyName }: { certs: MyCert[]; vouchers: MyVoucher[]; catalog: CatalogOption[]; companyName: string | null }) {
  const { locale, t } = useLocale();
  const c = t.certs;
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [codes, setCodes] = useState<Record<string, string | null>>({});
  const now = new Date();

  async function toggleShare(id: string, shared: boolean) {
    await fetch(`/api/certificates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sharedWithCompany: shared }) });
    router.refresh();
  }
  async function remove(id: string) {
    await fetch(`/api/certificates/${id}`, { method: "DELETE" });
    router.refresh();
  }
  async function reveal(id: string) {
    if (id in codes) return setCodes(({ [id]: _drop, ...rest }) => (void _drop, rest));
    const res = await fetch(`/api/vouchers/${id}/code`, { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { code?: string | null } | null;
    setCodes((s) => ({ ...s, [id]: data?.code ?? null }));
  }
  async function redeem(id: string, redeemed: boolean) {
    await fetch(`/api/vouchers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redeemed }) });
    router.refresh();
  }

  const statusBadge = (expiresAt: string | null) => {
    const s = certStatus(expiresAt ? new Date(expiresAt) : null, now);
    return s === "expired" ? <Badge tone="danger">{c.statusExpired}</Badge> : s === "expiring" ? <Badge tone="warning">{c.statusExpiring}</Badge> : <Badge tone="mint">{c.statusValid}</Badge>;
  };

  return (
    <div className="flex flex-col gap-6" data-testid="my-certificates">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <p className="mt-1 text-sm text-subtle">{c.subtitle}</p>
        </div>
        <Button onClick={() => setAdding(true)} iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />} data-testid="add-certificate">{c.add}</Button>
      </header>

      {certs.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title={c.empty} description={c.emptyBody} action={<Button size="sm" onClick={() => setAdding(true)}>{c.add}</Button>} />
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
          {certs.map((x) => (
            <li key={x.id}>
              <Card className="flex h-full flex-col gap-3" data-testid={`cert-${x.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{x.title}</p>
                    {x.vendor && <p className="text-xs text-subtle">{x.vendor}</p>}
                  </div>
                  {statusBadge(x.expiresAt)}
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-xs text-faint">{c.earned}</dt><dd>{day(x.earnedAt, locale)}</dd></div>
                  <div><dt className="text-xs text-faint">{c.validUntil}</dt><dd>{day(x.expiresAt, locale) ?? c.unlimited}</dd></div>
                </dl>
                {x.evidenceUrl && <a href={x.evidenceUrl} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-link hover:underline">{x.evidenceUrl}</a>}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
                  {companyName ? (
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={x.shared} onChange={(e) => void toggleShare(x.id, e.target.checked)} data-testid={`share-${x.id}`} />
                      {fmt(c.shareFor, { name: companyName })}
                    </label>
                  ) : <span />}
                  <Button variant="ghost" size="sm" onClick={() => void remove(x.id)}>{c.remove}</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {companyName && certs.length > 0 && <p className="text-xs text-faint">{c.shareNote}</p>}

      <section aria-label={c.vouchers}>
        <h2 className="mb-3 text-lg font-semibold">{c.vouchers}</h2>
        {vouchers.length === 0 ? (
          <p className="text-sm text-subtle">{c.noVouchers}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {vouchers.map((v) => (
              <li key={v.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4" data-testid={`voucher-${v.id}`}>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-semibold">{v.certName}</p>
                    <p className="text-xs text-subtle">{fmt(c.from, { name: v.orgName })} · {fmt(c.expiresOn, { date: day(v.expiresAt, locale) ?? "" })}{v.note ? ` · ${v.note}` : ""}</p>
                  </div>
                  {v.redeemed && <Badge tone="mint">{c.redeemed}</Badge>}
                  {v.hasCode ? (
                    <Button size="sm" variant="secondary" onClick={() => void reveal(v.id)}>{v.id in codes ? c.hideCode : c.showCode}</Button>
                  ) : <span className="text-xs text-faint">{c.noCode}</span>}
                  <Button size="sm" variant="ghost" onClick={() => void redeem(v.id, !v.redeemed)}>{v.redeemed ? c.unredeem : c.redeem}</Button>
                  {v.id in codes && <code className="w-full rounded-md bg-control px-3 py-2 font-mono text-sm" data-testid="voucher-code">{codes[v.id] ?? c.noCode}</code>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && <AddDialog catalog={catalog} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddDialog({ catalog, onClose }: { catalog: CatalogOption[]; onClose: () => void }) {
  const { t } = useLocale();
  const c = t.certs;
  const router = useRouter();
  const [catalogId, setCatalogId] = useState("");
  const [title, setTitle] = useState("");
  const [vendor, setVendor] = useState("");
  const [earned, setEarned] = useState("");
  const [expires, setExpires] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  function pick(id: string) {
    setCatalogId(id);
    const entry = catalog.find((x) => x.id === id);
    if (entry) {
      setTitle(entry.name);
      setVendor(entry.provider);
      if (earned) setExpires(expiryFrom(new Date(`${earned}T00:00:00Z`), entry.validityMonths)?.toISOString().slice(0, 10) ?? "");
    }
  }
  function changeEarned(value: string) {
    setEarned(value);
    const entry = catalog.find((x) => x.id === catalogId);
    if (entry && value) setExpires(expiryFrom(new Date(`${value}T00:00:00Z`), entry.validityMonths)?.toISOString().slice(0, 10) ?? "");
  }

  async function save() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ certificationId: catalogId || null, title, vendor, earnedAt: earned, expiresAt: expires || null, evidenceUrl: evidence || null }) });
      if (!res.ok) return setError(true);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent closeLabel={c.close} data-testid="cert-dialog">
        <DialogTitle>{c.add}</DialogTitle>
        <DialogDescription className="sr-only">{c.subtitle}</DialogDescription>
        <div className="mt-4 space-y-3">
          <label className="block text-sm"><span className="mb-1 block font-medium">{c.fCatalog}</span>
            <select value={catalogId} onChange={(e) => pick(e.target.value)} className={field}><option value="">{c.fFree}</option>{catalog.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{c.fTitle}</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={field} data-testid="cert-title" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{c.fVendor}</span><input value={vendor} onChange={(e) => setVendor(e.target.value)} className={field} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="mb-1 block font-medium">{c.fEarned}</span><input type="date" value={earned} onChange={(e) => changeEarned(e.target.value)} className={field} data-testid="cert-earned" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">{c.fExpires}</span><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={field} /></label>
          </div>
          <label className="block text-sm"><span className="mb-1 block font-medium">{c.fEvidence}</span><input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://" className={field} /></label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-danger-text">{c.failed}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{c.cancel}</Button>
          <Button onClick={() => void save()} disabled={busy || !title.trim() || !earned} data-testid="cert-save">{c.save}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
