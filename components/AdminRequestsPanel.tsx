"use client";

import { c_adminRequestsPanel } from "@/lib/i18n/components/adminRequestsPanel";
import { fill } from "@/lib/i18n/fill";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATALOG_STATUS_LABELS, REQUEST_STATUS_LABELS, SETTABLE_REQUEST_STATUSES } from "@/lib/course-requests";
import type { CatalogStatus, CourseRequestStatus } from "@/lib/server/db/schema";

type AdminRequest = {
  id: string;
  organizationName: string;
  requesterName: string | null;
  requesterEmail: string | null;
  status: CourseRequestStatus;
  statusNote: string | null;
  wishTitle: string | null;
  wishDescription: string | null;
  certificationId: string | null;
  courseName: string | null;
  courseCatalogStatus: CatalogStatus | null;
  createdAt: string;
};
type CatalogRow = {
  id: string;
  name: string;
  catalogStatus: CatalogStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  versionLabel: string | null;
  changesSinceApproval: number | null;
};

export type EntitlementView = {
  organizationId: string;
  organizationName: string;
  certificationId: string;
  courseName: string;
  releasedAt: string;
  openAssignments: number;
};

function EntitlementItem({ e, locale }: { e: EntitlementView; locale: "de" | "en" }) {
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const de = locale === "de";
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function revoke() {
    const hint = fill(c_adminRequestsPanel(de).revokeReleaseOf0For, e.courseName, e.organizationName, e.openAssignments);
    if (!(await confirm(hint))) return;
    const err = await call("/api/admin/entitlements", "DELETE", { organizationId: e.organizationId, certificationId: e.certificationId, note: note || null });
    setError(err);
    if (!err) router.refresh();
  }
  return (
    <>
    {confirmDialog}
    <li className="rounded-md border border-border bg-background p-3 text-sm" data-testid="admin-entitlement-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{e.courseName}</span>
          <span className="ml-2 text-xs text-muted">
            {e.organizationName} · {new Date(e.releasedAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })} · {c_adminRequestsPanel(de).openAssignments}: {e.openAssignments}
          </span>
        </span>
        <span className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            maxLength={500}
            placeholder={c_adminRequestsPanel(de).noteToTheCompanyOptional}
            aria-label={c_adminRequestsPanel(de).note}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
          />
          <button type="button" onClick={() => void revoke()} data-testid="admin-entitlement-revoke" className="rounded-md border border-border px-3 py-1 text-xs hover:bg-surface">
            {c_adminRequestsPanel(de).revokeRelease}
          </button>
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger-text">
          {error}
        </p>
      )}
    </li>
    </>
  );
}

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? `Fehler ${res.status}`;
}

function RequestRow({ r, releasable, locale }: { r: AdminRequest; releasable: CatalogRow[]; locale: "de" | "en" }) {
  const router = useRouter();
  const de = locale === "de";
  const [status, setStatus] = useState<CourseRequestStatus>(r.status === "released" || r.status === "withdrawn" || r.status === "revoked" ? "submitted" : r.status);
  const [note, setNote] = useState("");
  const [courseId, setCourseId] = useState(r.certificationId ?? "");
  const [error, setError] = useState<string | null>(null);
  const done = r.status === "released" || r.status === "withdrawn" || r.status === "revoked";

  async function save() {
    setError(await call(`/api/admin/course-requests/${r.id}`, "PATCH", { status, note: note || null }));
    setNote("");
    router.refresh();
  }
  async function release() {
    const err = await call(`/api/admin/course-requests/${r.id}/release`, "POST", { certificationId: courseId || null, note: note || null });
    setError(err);
    if (!err) router.refresh();
  }

  return (
    <li className="rounded-md border border-border bg-background p-3 text-sm" data-testid="admin-request-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{r.courseName ?? r.wishTitle}</span>
          <span className="ml-2 text-xs text-muted">
            {r.organizationName} · {r.requesterName ?? r.requesterEmail ?? "–"} · {new Date(r.createdAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}
          </span>
        </span>
        <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-medium text-link" data-testid="admin-request-status">
          {REQUEST_STATUS_LABELS[r.status][locale]}
        </span>
      </div>
      {r.wishDescription && <p className="mt-1 text-xs text-muted">{r.wishDescription}</p>}
      {r.statusNote && <p className="mt-1 text-xs">{r.statusNote}</p>}
      {!done && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={status} onChange={(e) => setStatus(e.target.value as CourseRequestStatus)} aria-label="Status" className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
              {SETTABLE_REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {REQUEST_STATUS_LABELS[s][locale]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={c_adminRequestsPanel(de).noteToTheCompanyRequired}
              aria-label={c_adminRequestsPanel(de).note}
              className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs"
            />
            <button type="button" onClick={() => void save()} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-surface">
              {c_adminRequestsPanel(de).setStatus}
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label={c_adminRequestsPanel(de).courseToRelease} className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
              <option value="">{r.certificationId ? (c_adminRequestsPanel(de).requestedCourse) : c_adminRequestsPanel(de).chooseACourse}</option>
              {releasable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void release()}
              disabled={!courseId && !r.certificationId}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              {c_adminRequestsPanel(de).releaseForCompany}
            </button>
          </div>
          {r.certificationId && r.courseCatalogStatus !== "approved" && (
            <p className="text-xs text-danger-text">{c_adminRequestsPanel(de).theRequestedCourseHasNot}</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger-text">
          {error}
        </p>
      )}
    </li>
  );
}

function CatalogItem({ c, locale }: { c: CatalogRow; locale: "de" | "en" }) {
  const router = useRouter();
  const de = locale === "de";
  const [status, setStatus] = useState<CatalogStatus>(c.catalogStatus);
  const [name, setName] = useState(c.approvedByName ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(await call(`/api/admin/certifications/${c.id}/catalog`, "PATCH", { status, approvedByName: status === "approved" ? name : null, confirmed: status === "approved" ? confirmed : undefined }));
    router.refresh();
  }
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm sm:flex-row sm:items-center" data-testid="catalog-row">
      <span className="flex-1">
        <span className="font-medium">{c.name}</span>
        {c.approvedAt && (
          <span className="ml-2 text-xs text-muted">
            {c_adminRequestsPanel(de).reviewedBy} {c.approvedByName}, {new Date(c.approvedAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}
            {c.versionLabel ? ` · ${c_adminRequestsPanel(de).version} ${c.versionLabel}` : ""}
          </span>
        )}
        {c.changesSinceApproval !== null && c.changesSinceApproval > 0 && (
          <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-text" data-testid="catalog-changes">
            {c.changesSinceApproval} {de ? (c.changesSinceApproval === 1 ? "Änderung seit Prüfung" : "Änderungen seit Prüfung") : c.changesSinceApproval === 1 ? "change since review" : "changes since review"}
          </span>
        )}
      </span>
      <select value={status} onChange={(e) => setStatus(e.target.value as CatalogStatus)} aria-label="Status" className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
        {(Object.keys(CATALOG_STATUS_LABELS) as CatalogStatus[]).map((s) => (
          <option key={s} value={s}>
            {CATALOG_STATUS_LABELS[s][locale]}
          </option>
        ))}
      </select>
      {status === "approved" && (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder={c_adminRequestsPanel(de).reviewerName}
          aria-label={c_adminRequestsPanel(de).reviewerName}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
        />
      )}
      {status === "approved" && (
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="catalog-confirm" />
          {c_adminRequestsPanel(de).contentOfThisVersionReviewed}
        </label>
      )}
      <button type="button" onClick={() => void save()} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-surface">
        {c_adminRequestsPanel(de).save}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </li>
  );
}

/** Betreiber: Anfragen aller Firmen bearbeiten und den fachlichen Prüfstatus der Lernpfade pflegen. */
export function AdminRequestsPanel({ requests, catalog, entitlements, locale }: { requests: AdminRequest[]; catalog: CatalogRow[]; entitlements: EntitlementView[]; locale: "de" | "en" }) {
  const de = locale === "de";
  const releasable = catalog.filter((c) => c.catalogStatus === "approved");
  return (
    <>
      <section className="rounded-lg border border-border bg-surface p-6" data-testid="admin-requests">
        <h2 className="text-lg font-medium">{c_adminRequestsPanel(de).requests}</h2>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{c_adminRequestsPanel(de).noRequests}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {requests.map((r) => (
              <RequestRow key={r.id} r={r} releasable={releasable} locale={locale} />
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-6" data-testid="admin-entitlements">
        <h2 className="text-lg font-medium">{c_adminRequestsPanel(de).releasesGrantedToCompanies}</h2>
        <p className="mt-1 text-sm text-muted">
          {c_adminRequestsPanel(de).afterRevokingTheCompanyCan}
        </p>
        {entitlements.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{c_adminRequestsPanel(de).noReleases}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {entitlements.map((e) => (
              <EntitlementItem key={`${e.organizationId}-${e.certificationId}`} e={e} locale={locale} />
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-6" data-testid="admin-catalog">
        <h2 className="text-lg font-medium">{c_adminRequestsPanel(de).generalCoursesExpertReview}</h2>
        <p className="mt-1 text-sm text-muted">
          {c_adminRequestsPanel(de).onlyApprovedCoursesCanBe}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {catalog.map((c) => (
            <CatalogItem key={c.id} c={c} locale={locale} />
          ))}
        </ul>
      </section>
    </>
  );
}
