"use client";

import { c_reviewerReviewerProfileEditor } from "@/lib/i18n/components/reviewerReviewerProfileEditor";
import { useState } from "react";
import { ExpertProfileView } from "@/components/experts/ExpertProfileView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { publicView, type CertificationData, type ExperienceData, type ProfileData } from "@/lib/reviewers/profile";
import type { ReviewerExperienceKind, ReviewerProfileField } from "@/lib/server/db/schema";
import type { Locale } from "@/lib/types";

export type OwnProfileJson = {
  profile: (Omit<ProfileData, "bio"> & { bio: { de: string; en: string } | null; slug: string; published: boolean }) | null;
  experience: ExperienceData[];
  certifications: Array<Omit<CertificationData, "verifiedAt"> & { verifiedAt: string | null }>;
  photoVersion?: number | null;
};
type Courses = Array<{ slug: string; name: string; versionLabel: string; approvedAt: string }>;

const fieldCls = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const KINDS: ReviewerExperienceKind[] = ["job", "project", "teaching"];

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

async function upload(file: File): ReturnType<typeof call> {
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "Das Foto ist größer als 2 MB.", problems: [] };
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await fetch("/api/reviewer/profile/photo", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: json as OwnProfileJson };
    return { ok: false, error: (json as { error?: string }).error ?? "Das hat nicht geklappt.", problems: [] };
  } catch {
    return { ok: false, error: "Netzwerkfehler", problems: [] };
  }
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: true; data: OwnProfileJson } | { ok: false; error: string; problems: string[] }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: json as OwnProfileJson };
    return { ok: false, error: (json as { error?: string }).error ?? "Das hat nicht geklappt.", problems: (json as { problems?: string[] }).problems ?? [] };
  } catch {
    return { ok: false, error: "Netzwerkfehler", problems: [] };
  }
}

/** Self-Service für das Expertenprofil: Felder einzeln veröffentlichen, Vorschau, veröffentlichen und sofort zurückziehen. */
export function ReviewerProfileEditor({ initial, courses, locale }: { initial: OwnProfileJson; courses: Courses; locale: Locale }) {
  const de = locale === "de";
  const [data, setData] = useState<OwnProfileJson>(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; problems?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const p = data.profile;
  const [form, setForm] = useState({
    firstName: p?.firstName ?? "",
    lastName: p?.lastName ?? "",
    country: p?.country ?? "",
    region: p?.region ?? "",
    bioDe: p?.bio?.de ?? "",
    bioEn: p?.bio?.en ?? "",
    linkedinUrl: p?.linkedinUrl ?? "",
    consent: { name: Boolean(p?.consent.name), country: Boolean(p?.consent.country), region: Boolean(p?.consent.region), bio: Boolean(p?.consent.bio), linkedin: Boolean(p?.consent.linkedin), indexing: Boolean(p?.consent.indexing), photo: Boolean(p?.consent.photo) } as Record<ReviewerProfileField, boolean>,
  });

  async function run(action: () => ReturnType<typeof call>, success: string) {
    setBusy(true);
    setMessage(null);
    const r = await action();
    setBusy(false);
    if (r.ok) {
      setData(r.data);
      setMessage({ tone: "ok", text: success });
      return true;
    }
    setMessage({ tone: "error", text: r.error, problems: r.problems });
    return false;
  }

  /** Die Meldung oben im Formular liegt beim Klick meist außerhalb des Bildschirms: zusätzlich ein Toast als Bestätigung. */
  async function publish() {
    const text = c_reviewerReviewerProfileEditor(de).profilePublished;
    if (await run(() => call("/api/reviewer/profile/publish", "POST", { action: "publish" }), text)) toast.success(text);
  }

  const saveProfile = () =>
    run(
      () => call("/api/reviewer/profile", "PUT", { firstName: form.firstName, lastName: form.lastName, country: form.country, region: form.region || null, bio: form.bioDe || form.bioEn ? { de: form.bioDe, en: form.bioEn } : null, linkedinUrl: form.linkedinUrl || null, consent: form.consent }),
      c_reviewerReviewerProfileEditor(de).profileSaved,
    );

  const consentBox = (field: ReviewerProfileField, label: string) => (
    <label className="mt-1 flex items-center gap-2 text-xs text-subtle">
      <input type="checkbox" checked={form.consent[field]} onChange={(e) => setForm({ ...form, consent: { ...form.consent, [field]: e.target.checked } })} data-testid={`consent-${field}`} />
      {label}
    </label>
  );
  const show = c_reviewerReviewerProfileEditor(de).showPublicly;

  const preview = p
    ? publicView({
        slug: p.slug,
        published: true,
        profile: { ...p, bio: p.bio },
        experience: data.experience,
        certifications: data.certifications.map((c) => ({ ...c, verifiedAt: c.verifiedAt ? new Date(c.verifiedAt) : null })),
        today: new Date(),
        photoVersion: data.photoVersion ?? null,
      })
    : null;
  // Die Vorschau zeigt das eigene Foto auch vor der Veröffentlichung (die öffentliche Adresse gibt es erst danach).
  if (preview?.photoUrl) preview.photoUrl = `/api/reviewer/profile/photo?v=${data.photoVersion}`;

  return (
    <div className="flex flex-col gap-6" data-testid="reviewer-profile-editor">
      <p className="text-sm text-subtle">
        {c_reviewerReviewerProfileEditor(de).onlyWhatYouReleaseField}
      </p>

      {message && (
        <div role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm text-danger-text" : "rounded-xl border border-mint-border bg-mint-soft p-3 text-sm text-mint-text"} data-testid="profile-message">
          {message.text}
          {message.problems && message.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {message.problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">{c_reviewerReviewerProfileEditor(de).aboutYou}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).firstName}</span>
            <input className={fieldCls} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} data-testid="profile-first-name" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).lastName}</span>
            <input className={fieldCls} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} data-testid="profile-last-name" />
          </label>
          <div className="sm:col-span-2">{consentBox("name", `${show}: ${c_reviewerReviewerProfileEditor(de).name}`)}</div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).country}</span>
            <input className={fieldCls} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} data-testid="profile-country" />
            {consentBox("country", `${show}: ${c_reviewerReviewerProfileEditor(de).country2}`)}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).regionOptional}</span>
            <input className={fieldCls} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} data-testid="profile-region" />
            {consentBox("region", `${show}: ${c_reviewerReviewerProfileEditor(de).region}`)}
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).aboutGerman}</span>
            <textarea className={fieldCls} rows={3} maxLength={1500} value={form.bioDe} onChange={(e) => setForm({ ...form, bioDe: e.target.value })} data-testid="profile-bio-de" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).aboutEnglish}</span>
            <textarea className={fieldCls} rows={3} maxLength={1500} value={form.bioEn} onChange={(e) => setForm({ ...form, bioEn: e.target.value })} data-testid="profile-bio-en" />
            {consentBox("bio", `${show}: ${c_reviewerReviewerProfileEditor(de).about}`)}
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">LinkedIn (https://…linkedin.com/…)</span>
            <input className={fieldCls} value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} data-testid="profile-linkedin" />
            {consentBox("linkedin", `${show}: LinkedIn`)}
          </label>
          {p && (
            <div className="sm:col-span-2" data-testid="photo-section">
              <span className="mb-1 block text-sm font-medium">{c_reviewerReviewerProfileEditor(de).photoOptional}</span>
              <div className="flex flex-wrap items-center gap-3">
                {data.photoVersion ? (
                  // eslint-disable-next-line @next/next/no-img-element -- eigenes Foto, nicht optimierbar und nur für die Person selbst
                  <img src={`/api/reviewer/profile/photo?v=${data.photoVersion}`} alt={c_reviewerReviewerProfileEditor(de).yourProfilePhoto} width={72} height={72} decoding="async" className="h-[72px] w-[72px] rounded-full border border-border object-cover" data-testid="photo-preview" />
                ) : (
                  <span className="text-sm text-subtle">{c_reviewerReviewerProfileEditor(de).noPhotoYet}</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={c_reviewerReviewerProfileEditor(de).choosePhoto}
                  data-testid="photo-input"
                  disabled={busy}
                  className="text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void run(() => upload(file), c_reviewerReviewerProfileEditor(de).photoSaved);
                  }}
                />
                {data.photoVersion && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => call("/api/reviewer/profile/photo", "DELETE"), c_reviewerReviewerProfileEditor(de).photoDeleted)} data-testid="photo-delete">
                    {c_reviewerReviewerProfileEditor(de).deletePhoto}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-subtle">{c_reviewerReviewerProfileEditor(de).pngJpegOrWebpUp}</p>
              {consentBox("photo", `${show}: ${c_reviewerReviewerProfileEditor(de).photo}`)}
            </div>
          )}
          <div className="sm:col-span-2">{consentBox("indexing", c_reviewerReviewerProfileEditor(de).searchEnginesMayIndexMy)}</div>
        </div>
        <Button className="mt-4" onClick={() => void saveProfile()} disabled={busy || !form.firstName.trim() || !form.lastName.trim() || !form.country.trim()} data-testid="profile-save">
          {c_reviewerReviewerProfileEditor(de).saveProfile}
        </Button>
      </Card>

      {p && (
        <>
          <ExperienceSection experience={data.experience} de={de} busy={busy} run={run} />
          <CertificationSection certifications={data.certifications} de={de} busy={busy} run={run} />

          <Card>
            <h2 className="mb-2 text-lg font-semibold">{c_reviewerReviewerProfileEditor(de).publishing}</h2>
            <p className="mb-3 text-sm" data-testid="publish-state">
              {p.published ? (
                <>
                  <Badge tone="mint">{c_reviewerReviewerProfileEditor(de).published}</Badge>{" "}
                  <a href={`/experts/${p.slug}`} className="text-link hover:underline" data-testid="public-link">/experts/{p.slug}</a>
                </>
              ) : (
                <Badge tone="warning">{c_reviewerReviewerProfileEditor(de).notPublished}</Badge>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {!p.published && (
                <Button onClick={() => void publish()} disabled={busy} data-testid="profile-publish">
                  {c_reviewerReviewerProfileEditor(de).publish}
                </Button>
              )}
              {p.published && (
                <Button variant="secondary" onClick={() => void run(() => call("/api/reviewer/profile/publish", "POST", { action: "withdraw" }), c_reviewerReviewerProfileEditor(de).profileWithdrawnItIsNo)} disabled={busy} data-testid="profile-withdraw">
                  {c_reviewerReviewerProfileEditor(de).withdrawProfile}
                </Button>
              )}
            </div>
          </Card>

          <section aria-labelledby="preview-title" data-testid="profile-preview">
            <h2 id="preview-title" className="mb-1 text-lg font-semibold">{c_reviewerReviewerProfileEditor(de).preview}</h2>
            <p className="mb-3 text-xs text-subtle">{c_reviewerReviewerProfileEditor(de).thisIsHowThePublic}</p>
            {preview ? (
              <div className="rounded-2xl border border-dashed border-border-strong p-4">
                <ExpertProfileView profile={preview} courses={courses} locale={locale} />
              </div>
            ) : (
              <p className="text-sm text-subtle" data-testid="preview-empty">{c_reviewerReviewerProfileEditor(de).nothingToShowYetName}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

type Run = (action: () => ReturnType<typeof call>, success: string) => Promise<boolean | undefined>;

function ExperienceSection({ experience, de, busy, run }: { experience: ExperienceData[]; de: boolean; busy: boolean; run: Run }) {
  const blank = { kind: "job" as ReviewerExperienceKind, title: "", organization: "", periodFrom: "", periodTo: "", description: "", isPublic: true };
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState(blank);
  const open = (e?: ExperienceData) => {
    setF(e ? { kind: e.kind, title: e.title, organization: e.organization ?? "", periodFrom: e.periodFrom, periodTo: e.periodTo ?? "", description: e.description ?? "", isPublic: e.isPublic } : blank);
    setEditing(e ? e.id : "new");
  };
  const body = { ...f, organization: f.organization || null, periodTo: f.periodTo || null, description: f.description || null };
  const kindLabel = (k: ReviewerExperienceKind) => (de ? { job: "Beruf", project: "Projekt", teaching: "Lehre" }[k] : { job: "Job", project: "Project", teaching: "Teaching" }[k]);
  return (
    <Card data-testid="experience-section">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{c_reviewerReviewerProfileEditor(de).experience}</h2>
        <Button size="sm" variant="secondary" onClick={() => open()} data-testid="experience-new">{c_reviewerReviewerProfileEditor(de).addEntry}</Button>
      </div>
      <ul className="flex flex-col gap-2">
        {experience.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm" data-testid="experience-item">
            <span>
              <span className="font-medium">{e.title}</span> <span className="text-subtle">· {kindLabel(e.kind)} · {e.periodFrom}–{e.periodTo ?? (c_reviewerReviewerProfileEditor(de).present)}</span>
              <span className="block text-xs text-subtle">{e.isPublic ? (c_reviewerReviewerProfileEditor(de).public) : c_reviewerReviewerProfileEditor(de).notPublic}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={() => open(e)}>{c_reviewerReviewerProfileEditor(de).edit}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call(`/api/reviewer/profile/experience/${e.id}`, "DELETE"), c_reviewerReviewerProfileEditor(de).entryDeleted)}>{c_reviewerReviewerProfileEditor(de).delete}</Button>
            </span>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="mt-4 grid gap-3 rounded-xl border border-accent-border p-3 sm:grid-cols-2" data-testid="experience-form">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).type}</span>
            <select className={fieldCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ReviewerExperienceKind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{kindLabel(k)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).title}</span>
            <input className={fieldCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="experience-title" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).organisationOptional}</span>
            <input className={fieldCls} value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).from2019Or201904}</span>
              <input className={fieldCls} value={f.periodFrom} onChange={(e) => setF({ ...f, periodFrom: e.target.value })} data-testid="experience-from" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).toEmptyOngoing}</span>
              <input className={fieldCls} value={f.periodTo} onChange={(e) => setF({ ...f, periodTo: e.target.value })} />
            </label>
          </div>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).shortDescriptionOptional}</span>
            <textarea className={fieldCls} rows={2} maxLength={800} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} data-testid="experience-public" />
            {c_reviewerReviewerProfileEditor(de).showPublicly}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={busy}
              data-testid="experience-save"
              onClick={async () => {
                const ok = await run(() => (editing === "new" ? call("/api/reviewer/profile/experience", "POST", body) : call(`/api/reviewer/profile/experience/${editing}`, "PUT", body)), c_reviewerReviewerProfileEditor(de).entrySaved);
                if (ok) setEditing(null);
              }}
            >
              {c_reviewerReviewerProfileEditor(de).save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{c_reviewerReviewerProfileEditor(de).cancel}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function CertificationSection({ certifications, de, busy, run }: { certifications: OwnProfileJson["certifications"]; de: boolean; busy: boolean; run: Run }) {
  const blank = { vendor: "", name: "", earnedOn: "", validUntil: "", verificationUrl: "", isPublic: true };
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState(blank);
  const open = (c?: OwnProfileJson["certifications"][number]) => {
    setF(c ? { vendor: c.vendor, name: c.name, earnedOn: c.earnedOn, validUntil: c.validUntil ?? "", verificationUrl: c.verificationUrl, isPublic: c.isPublic } : blank);
    setEditing(c ? c.id : "new");
  };
  const body = { ...f, validUntil: f.validUntil || null };
  return (
    <Card data-testid="certification-section">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{c_reviewerReviewerProfileEditor(de).certifications}</h2>
        <Button size="sm" variant="secondary" onClick={() => open()} data-testid="cert-new">{c_reviewerReviewerProfileEditor(de).addCertification}</Button>
      </div>
      <p className="mb-3 text-xs text-subtle">{c_reviewerReviewerProfileEditor(de).pleaseOnlyGiveTheLink}</p>
      <ul className="flex flex-col gap-2">
        {certifications.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm" data-testid="cert-item">
            <span>
              <span className="font-medium">{c.name}</span> <span className="text-subtle">· {c.vendor}</span>
              <span className="block text-xs text-subtle">
                {c.earnedOn}
                {c.validUntil ? ` → ${c.validUntil}` : ""} · {c.isPublic ? (c_reviewerReviewerProfileEditor(de).public) : c_reviewerReviewerProfileEditor(de).notPublic} · {c.verifiedAt ? (c_reviewerReviewerProfileEditor(de).proofChecked) : c_reviewerReviewerProfileEditor(de).proofNotCheckedYet}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={() => open(c)}>{c_reviewerReviewerProfileEditor(de).edit}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call(`/api/reviewer/profile/certifications/${c.id}`, "DELETE"), c_reviewerReviewerProfileEditor(de).certificationDeleted)}>{c_reviewerReviewerProfileEditor(de).delete}</Button>
            </span>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="mt-4 grid gap-3 rounded-xl border border-accent-border p-3 sm:grid-cols-2" data-testid="cert-form">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).vendor}</span>
            <input className={fieldCls} value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} data-testid="cert-vendor" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).certification}</span>
            <input className={fieldCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="cert-name" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).earnedOnYyyyMmDd}</span>
            <input className={fieldCls} value={f.earnedOn} onChange={(e) => setF({ ...f, earnedOn: e.target.value })} data-testid="cert-earned" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).validUntilOptional}</span>
            <input className={fieldCls} value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} data-testid="cert-valid" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{c_reviewerReviewerProfileEditor(de).proofLinkHttps}</span>
            <input className={fieldCls} value={f.verificationUrl} onChange={(e) => setF({ ...f, verificationUrl: e.target.value })} data-testid="cert-url" />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} data-testid="cert-public" />
            {c_reviewerReviewerProfileEditor(de).showPublicly}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={busy}
              data-testid="cert-save"
              onClick={async () => {
                const ok = await run(() => (editing === "new" ? call("/api/reviewer/profile/certifications", "POST", body) : call(`/api/reviewer/profile/certifications/${editing}`, "PUT", body)), c_reviewerReviewerProfileEditor(de).certificationSaved);
                if (ok) setEditing(null);
              }}
            >
              {c_reviewerReviewerProfileEditor(de).save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{c_reviewerReviewerProfileEditor(de).cancel}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
