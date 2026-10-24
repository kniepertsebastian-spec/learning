"use client";

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
  const router = useRouter();
  const de = locale === "de";
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function revoke() {
    const hint = de
      ? `Freigabe „${e.courseName}“ für ${e.organizationName} entziehen? Bestehende Zuweisungen (${e.openAssignments} offen) bleiben bestehen, neue sind nicht mehr möglich.`
      : `Revoke release of "${e.courseName}" for ${e.organizationName}? Existing assignments (${e.openAssignments} open) stay, new ones are no longer possible.`;
    if (!window.confirm(hint)) return;
    const err = await call("/api/admin/entitlements", "DELETE", { organizationId: e.organizationId, certificationId: e.certificationId, note: note || null });
    setError(err);
    if (!err) router.refresh();
  }
  return (
    <li className="rounded-md border border-border bg-background p-3 text-sm" data-testid="admin-entitlement-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{e.courseName}</span>
          <span className="ml-2 text-xs text-foreground/70">
            {e.organizationName} · {new Date(e.releasedAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })} · {de ? "offene Zuweisungen" : "open assignments"}: {e.openAssignments}
          </span>
        </span>
        <span className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            maxLength={500}
            placeholder={de ? "Hinweis an die Firma (optional)" : "Note to the company (optional)"}
            aria-label={de ? "Hinweis" : "Note"}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
          />
          <button type="button" onClick={() => void revoke()} data-testid="admin-entitlement-revoke" className="rounded-md border border-border px-3 py-1 text-xs hover:bg-surface">
            {de ? "Freigabe entziehen" : "Revoke release"}
          </button>
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-500">
          {error}
        </p>
      )}
    </li>
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
          <span className="ml-2 text-xs text-foreground/70">
            {r.organizationName} · {r.requesterName ?? r.requesterEmail ?? "–"} · {new Date(r.createdAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}
          </span>
        </span>
        <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-link" data-testid="admin-request-status">
          {REQUEST_STATUS_LABELS[r.status][locale]}
        </span>
      </div>
      {r.wishDescription && <p className="mt-1 text-xs text-foreground/70">{r.wishDescription}</p>}
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
              placeholder={de ? "Hinweis an die Firma (bei Ablehnung Pflicht)" : "Note to the company (required when declining)"}
              aria-label={de ? "Hinweis" : "Note"}
              className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs"
            />
            <button type="button" onClick={() => void save()} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-surface">
              {de ? "Stand setzen" : "Set status"}
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label={de ? "Lernpfad für die Freigabe" : "Course to release"} className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
              <option value="">{r.certificationId ? (de ? "Angefragter Lernpfad" : "Requested course") : de ? "Lernpfad wählen …" : "Choose a course …"}</option>
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
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
            >
              {de ? "Für die Firma freigeben" : "Release for company"}
            </button>
          </div>
          {r.certificationId && r.courseCatalogStatus !== "approved" && (
            <p className="text-xs text-red-500">{de ? "Der angefragte Lernpfad ist noch nicht fachlich freigegeben." : "The requested course has not been approved by an expert yet."}</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-500">
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
          <span className="ml-2 text-xs text-foreground/70">
            {de ? "geprüft von" : "reviewed by"} {c.approvedByName}, {new Date(c.approvedAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}
            {c.versionLabel ? ` · ${de ? "Version" : "Version"} ${c.versionLabel}` : ""}
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
          placeholder={de ? "Name der prüfenden Person" : "Reviewer name"}
          aria-label={de ? "Name der prüfenden Person" : "Reviewer name"}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
        />
      )}
      {status === "approved" && (
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="catalog-confirm" />
          {de ? "Inhalte dieser Version fachlich geprüft" : "Content of this version reviewed"}
        </label>
      )}
      <button type="button" onClick={() => void save()} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-surface">
        {de ? "Speichern" : "Save"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-500">
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
        <h2 className="text-lg font-medium">{de ? "Anfragen" : "Requests"}</h2>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/70">{de ? "Keine Anfragen." : "No requests."}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {requests.map((r) => (
              <RequestRow key={r.id} r={r} releasable={releasable} locale={locale} />
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-6" data-testid="admin-entitlements">
        <h2 className="text-lg font-medium">{de ? "Erteilte Firmenfreigaben" : "Releases granted to companies"}</h2>
        <p className="mt-1 text-sm text-foreground/70">
          {de
            ? "Beim Entziehen kann die Firma den Lernpfad nicht mehr neu zuweisen. Bestehende Zuweisungen und Lernfortschritt bleiben."
            : "After revoking, the company can no longer assign the course. Existing assignments and progress stay."}
        </p>
        {entitlements.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/70">{de ? "Keine Freigaben." : "No releases."}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {entitlements.map((e) => (
              <EntitlementItem key={`${e.organizationId}-${e.certificationId}`} e={e} locale={locale} />
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-6" data-testid="admin-catalog">
        <h2 className="text-lg font-medium">{de ? "Allgemeine Lernpfade: fachliche Prüfung" : "General courses: expert review"}</h2>
        <p className="mt-1 text-sm text-foreground/70">
          {de
            ? "Nur freigegebene Lernpfade lassen sich für Firmen freigeben und zuweisen. Die Freigabe nennt die prüfende Person (auch extern) und das Datum."
            : "Only approved courses can be released to companies and assigned. Approval records the reviewer (also external) and the date."}
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
