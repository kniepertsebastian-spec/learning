"use client";

import { useState } from "react";
import { ExpertProfileView } from "@/components/experts/ExpertProfileView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  const saveProfile = () =>
    run(
      () => call("/api/reviewer/profile", "PUT", { firstName: form.firstName, lastName: form.lastName, country: form.country, region: form.region || null, bio: form.bioDe || form.bioEn ? { de: form.bioDe, en: form.bioEn } : null, linkedinUrl: form.linkedinUrl || null, consent: form.consent }),
      de ? "Profil gespeichert." : "Profile saved.",
    );

  const consentBox = (field: ReviewerProfileField, label: string) => (
    <label className="mt-1 flex items-center gap-2 text-xs text-subtle">
      <input type="checkbox" checked={form.consent[field]} onChange={(e) => setForm({ ...form, consent: { ...form.consent, [field]: e.target.checked } })} data-testid={`consent-${field}`} />
      {label}
    </label>
  );
  const show = de ? "Öffentlich zeigen" : "Show publicly";

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
        {de
          ? "Öffentlich wird nur, was du einzeln freigibst. Du kannst dein Profil jederzeit zurückziehen; es ist dann sofort nicht mehr erreichbar. Die Freigaben deiner Kurse bleiben davon unberührt."
          : "Only what you release field by field becomes public. You can withdraw your profile at any time; it is then unreachable immediately. Your course approvals are not affected."}
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
        <h2 className="mb-3 text-lg font-semibold">{de ? "Angaben zur Person" : "About you"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Vorname" : "First name"}</span>
            <input className={fieldCls} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} data-testid="profile-first-name" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Name" : "Last name"}</span>
            <input className={fieldCls} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} data-testid="profile-last-name" />
          </label>
          <div className="sm:col-span-2">{consentBox("name", `${show}: ${de ? "Name" : "name"}`)}</div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Land" : "Country"}</span>
            <input className={fieldCls} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} data-testid="profile-country" />
            {consentBox("country", `${show}: ${de ? "Land" : "country"}`)}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Region (optional, z. B. Bundesland)" : "Region (optional)"}</span>
            <input className={fieldCls} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} data-testid="profile-region" />
            {consentBox("region", `${show}: ${de ? "Region" : "region"}`)}
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{de ? "Kurzvorstellung (Deutsch)" : "About (German)"}</span>
            <textarea className={fieldCls} rows={3} maxLength={1500} value={form.bioDe} onChange={(e) => setForm({ ...form, bioDe: e.target.value })} data-testid="profile-bio-de" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{de ? "Kurzvorstellung (Englisch)" : "About (English)"}</span>
            <textarea className={fieldCls} rows={3} maxLength={1500} value={form.bioEn} onChange={(e) => setForm({ ...form, bioEn: e.target.value })} data-testid="profile-bio-en" />
            {consentBox("bio", `${show}: ${de ? "Kurzvorstellung" : "about"}`)}
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">LinkedIn (https://…linkedin.com/…)</span>
            <input className={fieldCls} value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} data-testid="profile-linkedin" />
            {consentBox("linkedin", `${show}: LinkedIn`)}
          </label>
          {p && (
            <div className="sm:col-span-2" data-testid="photo-section">
              <span className="mb-1 block text-sm font-medium">{de ? "Foto (optional)" : "Photo (optional)"}</span>
              <div className="flex flex-wrap items-center gap-3">
                {data.photoVersion ? (
                  // eslint-disable-next-line @next/next/no-img-element -- eigenes Foto, nicht optimierbar und nur für die Person selbst
                  <img src={`/api/reviewer/profile/photo?v=${data.photoVersion}`} alt={de ? "Dein Profilfoto" : "Your profile photo"} width={72} height={72} className="h-[72px] w-[72px] rounded-full border border-border object-cover" data-testid="photo-preview" />
                ) : (
                  <span className="text-sm text-subtle">{de ? "Noch kein Foto." : "No photo yet."}</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={de ? "Foto wählen" : "Choose photo"}
                  data-testid="photo-input"
                  disabled={busy}
                  className="text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void run(() => upload(file), de ? "Foto gespeichert." : "Photo saved.");
                  }}
                />
                {data.photoVersion && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => call("/api/reviewer/profile/photo", "DELETE"), de ? "Foto gelöscht." : "Photo deleted.")} data-testid="photo-delete">
                    {de ? "Foto löschen" : "Delete photo"}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-subtle">{de ? "PNG, JPEG oder WebP, höchstens 2 MB. Es wird nur gezeigt, wenn du es unten freigibst; mit dem Rückzug deines Profils wird es gelöscht." : "PNG, JPEG or WebP, up to 2 MB. It is only shown if you release it below; withdrawing your profile deletes it."}</p>
              {consentBox("photo", `${show}: ${de ? "Foto" : "photo"}`)}
            </div>
          )}
          <div className="sm:col-span-2">{consentBox("indexing", de ? "Suchmaschinen dürfen mein Profil finden (Indexierung)" : "Search engines may index my profile")}</div>
        </div>
        <Button className="mt-4" onClick={() => void saveProfile()} disabled={busy || !form.firstName.trim() || !form.lastName.trim() || !form.country.trim()} data-testid="profile-save">
          {de ? "Profil speichern" : "Save profile"}
        </Button>
      </Card>

      {p && (
        <>
          <ExperienceSection experience={data.experience} de={de} busy={busy} run={run} />
          <CertificationSection certifications={data.certifications} de={de} busy={busy} run={run} />

          <Card>
            <h2 className="mb-2 text-lg font-semibold">{de ? "Veröffentlichung" : "Publishing"}</h2>
            <p className="mb-3 text-sm" data-testid="publish-state">
              {p.published ? (
                <>
                  <Badge tone="mint">{de ? "Veröffentlicht" : "Published"}</Badge>{" "}
                  <a href={`/experts/${p.slug}`} className="text-link hover:underline" data-testid="public-link">/experts/{p.slug}</a>
                </>
              ) : (
                <Badge tone="warning">{de ? "Nicht veröffentlicht" : "Not published"}</Badge>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {!p.published && (
                <Button onClick={() => void run(() => call("/api/reviewer/profile/publish", "POST", { action: "publish" }), de ? "Profil veröffentlicht." : "Profile published.")} disabled={busy} data-testid="profile-publish">
                  {de ? "Veröffentlichen" : "Publish"}
                </Button>
              )}
              {p.published && (
                <Button variant="secondary" onClick={() => void run(() => call("/api/reviewer/profile/publish", "POST", { action: "withdraw" }), de ? "Profil zurückgezogen. Es ist nicht mehr öffentlich." : "Profile withdrawn. It is no longer public.")} disabled={busy} data-testid="profile-withdraw">
                  {de ? "Profil zurückziehen" : "Withdraw profile"}
                </Button>
              )}
            </div>
          </Card>

          <section aria-labelledby="preview-title" data-testid="profile-preview">
            <h2 id="preview-title" className="mb-1 text-lg font-semibold">{de ? "Vorschau" : "Preview"}</h2>
            <p className="mb-3 text-xs text-subtle">{de ? "So sähe die öffentliche Seite mit deinen aktuellen Freigaben aus." : "This is how the public page would look with your current releases."}</p>
            {preview ? (
              <div className="rounded-2xl border border-dashed border-border-strong p-4">
                <ExpertProfileView profile={preview} courses={courses} locale={locale} />
              </div>
            ) : (
              <p className="text-sm text-subtle" data-testid="preview-empty">{de ? "Noch nichts zu zeigen: Name und Land müssen freigegeben sein." : "Nothing to show yet: name and country must be released."}</p>
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
        <h2 className="text-lg font-semibold">{de ? "Erfahrung" : "Experience"}</h2>
        <Button size="sm" variant="secondary" onClick={() => open()} data-testid="experience-new">{de ? "Eintrag hinzufügen" : "Add entry"}</Button>
      </div>
      <ul className="flex flex-col gap-2">
        {experience.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm" data-testid="experience-item">
            <span>
              <span className="font-medium">{e.title}</span> <span className="text-subtle">· {kindLabel(e.kind)} · {e.periodFrom}–{e.periodTo ?? (de ? "heute" : "present")}</span>
              <span className="block text-xs text-subtle">{e.isPublic ? (de ? "öffentlich" : "public") : de ? "nicht öffentlich" : "not public"}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={() => open(e)}>{de ? "Bearbeiten" : "Edit"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call(`/api/reviewer/profile/experience/${e.id}`, "DELETE"), de ? "Eintrag gelöscht." : "Entry deleted.")}>{de ? "Löschen" : "Delete"}</Button>
            </span>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="mt-4 grid gap-3 rounded-xl border border-accent-border p-3 sm:grid-cols-2" data-testid="experience-form">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Art" : "Type"}</span>
            <select className={fieldCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ReviewerExperienceKind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{kindLabel(k)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Titel" : "Title"}</span>
            <input className={fieldCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="experience-title" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Organisation (optional)" : "Organisation (optional)"}</span>
            <input className={fieldCls} value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">{de ? "Von (2019 oder 2019-04)" : "From (2019 or 2019-04)"}</span>
              <input className={fieldCls} value={f.periodFrom} onChange={(e) => setF({ ...f, periodFrom: e.target.value })} data-testid="experience-from" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">{de ? "Bis (leer = laufend)" : "To (empty = ongoing)"}</span>
              <input className={fieldCls} value={f.periodTo} onChange={(e) => setF({ ...f, periodTo: e.target.value })} />
            </label>
          </div>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{de ? "Kurzbeschreibung (optional)" : "Short description (optional)"}</span>
            <textarea className={fieldCls} rows={2} maxLength={800} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} data-testid="experience-public" />
            {de ? "Öffentlich zeigen" : "Show publicly"}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={busy}
              data-testid="experience-save"
              onClick={async () => {
                const ok = await run(() => (editing === "new" ? call("/api/reviewer/profile/experience", "POST", body) : call(`/api/reviewer/profile/experience/${editing}`, "PUT", body)), de ? "Eintrag gespeichert." : "Entry saved.");
                if (ok) setEditing(null);
              }}
            >
              {de ? "Speichern" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{de ? "Abbrechen" : "Cancel"}</Button>
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
        <h2 className="text-lg font-semibold">{de ? "Zertifikate" : "Certifications"}</h2>
        <Button size="sm" variant="secondary" onClick={() => open()} data-testid="cert-new">{de ? "Zertifikat hinzufügen" : "Add certification"}</Button>
      </div>
      <p className="mb-3 text-xs text-subtle">{de ? "Bitte nur den Link auf die offizielle Prüfseite oder das digitale Abzeichen des Herstellers angeben, keine Dateien. Ein Admin prüft den Link; erst danach steht „Nachweis geprüft“ dabei. Ändert sich der Link, wird neu geprüft." : "Please only give the link to the vendor's official verification page or digital badge, no files. An admin checks the link; only then it says “proof checked”. If the link changes, it is checked again."}</p>
      <ul className="flex flex-col gap-2">
        {certifications.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm" data-testid="cert-item">
            <span>
              <span className="font-medium">{c.name}</span> <span className="text-subtle">· {c.vendor}</span>
              <span className="block text-xs text-subtle">
                {c.earnedOn}
                {c.validUntil ? ` → ${c.validUntil}` : ""} · {c.isPublic ? (de ? "öffentlich" : "public") : de ? "nicht öffentlich" : "not public"} · {c.verifiedAt ? (de ? "Nachweis geprüft" : "proof checked") : de ? "Nachweis noch nicht geprüft" : "proof not checked yet"}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={() => open(c)}>{de ? "Bearbeiten" : "Edit"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => call(`/api/reviewer/profile/certifications/${c.id}`, "DELETE"), de ? "Zertifikat gelöscht." : "Certification deleted.")}>{de ? "Löschen" : "Delete"}</Button>
            </span>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="mt-4 grid gap-3 rounded-xl border border-accent-border p-3 sm:grid-cols-2" data-testid="cert-form">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Hersteller" : "Vendor"}</span>
            <input className={fieldCls} value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} data-testid="cert-vendor" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Zertifikat" : "Certification"}</span>
            <input className={fieldCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="cert-name" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Erworben am (JJJJ-MM-TT)" : "Earned on (YYYY-MM-DD)"}</span>
            <input className={fieldCls} value={f.earnedOn} onChange={(e) => setF({ ...f, earnedOn: e.target.value })} data-testid="cert-earned" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{de ? "Gültig bis (optional)" : "Valid until (optional)"}</span>
            <input className={fieldCls} value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} data-testid="cert-valid" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{de ? "Nachweis-Link (https)" : "Proof link (https)"}</span>
            <input className={fieldCls} value={f.verificationUrl} onChange={(e) => setF({ ...f, verificationUrl: e.target.value })} data-testid="cert-url" />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} data-testid="cert-public" />
            {de ? "Öffentlich zeigen" : "Show publicly"}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={busy}
              data-testid="cert-save"
              onClick={async () => {
                const ok = await run(() => (editing === "new" ? call("/api/reviewer/profile/certifications", "POST", body) : call(`/api/reviewer/profile/certifications/${editing}`, "PUT", body)), de ? "Zertifikat gespeichert." : "Certification saved.");
                if (ok) setEditing(null);
              }}
            >
              {de ? "Speichern" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{de ? "Abbrechen" : "Cancel"}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
