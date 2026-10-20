"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

type Kind = "skill" | "tool";
type Level = "basic" | "confident" | "expert";
type Recency = "current" | "recent" | "older";
export type ProfileSkill = { id: string; kind: Kind; name: string; level: Level; recency: Recency | null; source: "manual" | "course" | "certificate"; sourceCourse: string | null };
export type ProfileData = {
  profile: { jobTitle: string | null; jobDescription: string | null; focusAreas: string | null; state: string | null };
  autoSkills: boolean;
  skills: ProfileSkill[];
};

const STATES: Array<[string, string]> = [
  ["BW", "Baden-Württemberg"],
  ["BY", "Bayern"],
  ["BE", "Berlin"],
  ["BB", "Brandenburg"],
  ["HB", "Bremen"],
  ["HH", "Hamburg"],
  ["HE", "Hessen"],
  ["MV", "Mecklenburg-Vorpommern"],
  ["NI", "Niedersachsen"],
  ["NW", "Nordrhein-Westfalen"],
  ["RP", "Rheinland-Pfalz"],
  ["SL", "Saarland"],
  ["SN", "Sachsen"],
  ["ST", "Sachsen-Anhalt"],
  ["SH", "Schleswig-Holstein"],
  ["TH", "Thüringen"],
];

const field = "w-full rounded-md border border-border-strong bg-control px-3 py-2 text-sm";

/**
 * Berufliches Profil (roadmap3.md, Schritt 8): aktuelle Stelle, Bundesland, Schwerpunkte, Skills mit Stufe und Tools
 * mit Aktualität. Grundlage für spätere Karrierepfade. Gehört nur der Person; die Firma sieht davon nichts.
 */
export function CareerProfile({ initial, courseNames }: { initial: ProfileData; courseNames: string[] }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const tr = (d: string, e: string) => (de ? d : e);
  const [data, setData] = React.useState(initial);
  const [form, setForm] = React.useState({
    jobTitle: initial.profile.jobTitle ?? "",
    jobDescription: initial.profile.jobDescription ?? "",
    focusAreas: initial.profile.focusAreas ?? "",
    state: initial.profile.state ?? "",
  });
  const [saved, setSaved] = React.useState<null | "ok" | "error">(null);
  const [skillError, setSkillError] = React.useState<string | null>(null);

  const LEVEL: Record<Level, string> = { basic: tr("Grundlagen", "Basics"), confident: tr("Sicher", "Confident"), expert: tr("Experte", "Expert") };
  const RECENCY: Record<Recency, string> = { current: tr("Aktueller Stand", "Up to date"), recent: tr("1–3 Jahre her", "1–3 years ago"), older: tr("Länger her", "Longer ago") };
  const SOURCE = { course: tr("aus Kurs", "from course"), certificate: tr("aus Zertifikat", "from certificate") } as const;

  const reload = async () => {
    const res = await fetch("/api/profile", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as ProfileData);
  };

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaved(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobTitle: form.jobTitle, jobDescription: form.jobDescription, focusAreas: form.focusAreas, state: form.state || null }),
    });
    setSaved(res.ok ? "ok" : "error");
  }

  async function addSkill(kind: Kind, name: string, level: Level, recency: Recency | null) {
    setSkillError(null);
    const res = await fetch("/api/profile/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, name, level, recency }) });
    if (res.status === 409) return setSkillError(tr(`„${name}“ steht schon in deinem Profil.`, `“${name}” is already in your profile.`)), false;
    if (!res.ok) return setSkillError(tr("Das hat nicht geklappt.", "That did not work.")), false;
    await reload();
    return true;
  }
  async function patchSkill(id: string, patch: { level?: Level; recency?: Recency }) {
    setData((d) => ({ ...d, skills: d.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
    const res = await fetch(`/api/profile/skills/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) await reload();
  }
  async function removeSkill(id: string) {
    setData((d) => ({ ...d, skills: d.skills.filter((s) => s.id !== id) }));
    const res = await fetch(`/api/profile/skills/${id}`, { method: "DELETE" });
    if (!res.ok) await reload();
  }

  const list = (kind: Kind) => (
    <ul className="flex flex-col gap-1.5" data-testid={`profile-${kind}s`}>
      {data.skills
        .filter((s) => s.kind === kind)
        .map((s) => (
          <li key={s.id} className="flex flex-col gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm" data-testid="profile-skill">
            {/* Zwei Zeilen: Name und Herkunft oben, Einstellungen darunter – der Name wird nie zusammengedrückt. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 font-medium break-words">{s.name}</span>
              {s.source !== "manual" && (
                <Badge tone={s.source === "certificate" ? "info" : "mint"} title={s.sourceCourse ?? undefined}>
                  {SOURCE[s.source]}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-8 rounded-md border border-border-strong bg-control px-2 text-xs" value={s.level} onChange={(e) => void patchSkill(s.id, { level: e.target.value as Level })} aria-label={tr(`Stufe für ${s.name}`, `Level for ${s.name}`)}>
                {(Object.keys(LEVEL) as Level[]).map((l) => (
                  <option key={l} value={l}>{LEVEL[l]}</option>
                ))}
              </select>
              {kind === "tool" && (
                <select className="h-8 rounded-md border border-border-strong bg-control px-2 text-xs" value={s.recency ?? "current"} onChange={(e) => void patchSkill(s.id, { recency: e.target.value as Recency })} aria-label={tr(`Aktualität für ${s.name}`, `Recency for ${s.name}`)}>
                  {(Object.keys(RECENCY) as Recency[]).map((r) => (
                    <option key={r} value={r}>{RECENCY[r]}</option>
                  ))}
                </select>
              )}
              <button type="button" className="ml-auto rounded p-1.5 text-subtle hover:bg-surface-2 hover:text-danger-text" onClick={() => void removeSkill(s.id)} aria-label={tr(`${s.name} entfernen`, `Remove ${s.name}`)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
    </ul>
  );

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5" data-testid="career-profile">
      <div>
        <h2 className="font-semibold">{tr("Beruf und Skills", "Job and skills")}</h2>
        <p className="mt-1 text-xs text-foreground/70">
          {tr(
            "Freiwillig. Daraus entstehen später passende Karrierepfade mit Kursempfehlungen. Nur du siehst diese Angaben, deine Firma nicht.",
            "Optional. Later used for matching career paths with course recommendations. Only you see this, not your company.",
          )}
        </p>
      </div>

      <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2" data-testid="profile-form">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{tr("Aktuelle Stelle", "Current job")}</span>
          <input className={field} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} maxLength={120} placeholder={tr("z. B. Systemadministrator", "e.g. System administrator")} data-testid="profile-job-title" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{tr("Bundesland", "German state")}</span>
          <select className={field} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} data-testid="profile-state">
            <option value="">–</option>
            {STATES.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">{tr("Was machst du in dieser Stelle?", "What do you do in this job?")}</span>
          <textarea className={cn(field, "min-h-20")} value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })} maxLength={2000} placeholder={tr("Aufgaben, Verantwortung, Umfeld", "Tasks, responsibilities, environment")} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">{tr("Womit hattest du schon viel zu tun?", "What have you worked with a lot?")}</span>
          <textarea className={cn(field, "min-h-20")} value={form.focusAreas} onChange={(e) => setForm({ ...form, focusAreas: e.target.value })} maxLength={2000} placeholder={tr("z. B. Netzwerke im Mittelstand, Migration in die Cloud, Support", "e.g. SMB networks, cloud migration, support")} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" iconLeft={<Save className="h-4 w-4" aria-hidden="true" />} data-testid="profile-save">{tr("Speichern", "Save")}</Button>
          {saved === "ok" && <span className="text-sm text-mint-text" role="status">{tr("Gespeichert.", "Saved.")}</span>}
          {saved === "error" && <span className="text-sm text-danger-text" role="alert">{tr("Bitte Angaben prüfen.", "Please check your input.")}</span>}
        </div>
      </form>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{tr("Skills", "Skills")}</h3>
          {list("skill")}
          <AddEntry kind="skill" de={de} levels={LEVEL} onAdd={addSkill} suggestions={courseNames} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{tr("Tools", "Tools")}</h3>
          {list("tool")}
          <AddEntry kind="tool" de={de} levels={LEVEL} recency={RECENCY} onAdd={addSkill} suggestions={[]} />
        </div>
      </div>
      {skillError && <p className="text-sm text-danger-text" role="alert">{skillError}</p>}
      <p className="text-xs text-subtle">
        {data.autoSkills
          ? tr("Bestandene Kurse und Zertifikate kommen automatisch dazu.", "Passed courses and certificates are added automatically.")
          : tr("Bestandene Kurse und Zertifikate können automatisch dazukommen: ", "Passed courses and certificates can be added automatically: ")}{" "}
        <Link href="/account" className="text-link hover:underline">{tr("Einstellung im Konto", "setting in your account")}</Link>
      </p>
    </section>
  );
}

function AddEntry({ kind, de, levels, recency, onAdd, suggestions }: { kind: Kind; de: boolean; levels: Record<Level, string>; recency?: Record<Recency, string>; onAdd: (kind: Kind, name: string, level: Level, recency: Recency | null) => Promise<boolean>; suggestions: string[] }) {
  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState<Level>("confident");
  const [rec, setRec] = React.useState<Recency>("current");
  const listId = `suggest-${kind}`;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await onAdd(kind, name.trim(), level, kind === "tool" ? rec : null)) setName("");
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2" data-testid={`add-${kind}`}>
      <input
        className="h-9 min-w-0 flex-1 basis-40 rounded-md border border-border-strong bg-control px-3 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        list={suggestions.length ? listId : undefined}
        placeholder={kind === "skill" ? (de ? "z. B. Kubernetes, IT-Sicherheit" : "e.g. Kubernetes, IT security") : de ? "z. B. Terraform, Wireshark" : "e.g. Terraform, Wireshark"}
        aria-label={kind === "skill" ? (de ? "Neuer Skill" : "New skill") : de ? "Neues Tool" : "New tool"}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <select className="h-9 rounded-md border border-border-strong bg-control px-2 text-sm" value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label={de ? "Stufe" : "Level"}>
        {(Object.keys(levels) as Level[]).map((l) => (
          <option key={l} value={l}>{levels[l]}</option>
        ))}
      </select>
      {recency && (
        <select className="h-9 rounded-md border border-border-strong bg-control px-2 text-sm" value={rec} onChange={(e) => setRec(e.target.value as Recency)} aria-label={de ? "Aktualität" : "Recency"}>
          {(Object.keys(recency) as Recency[]).map((r) => (
            <option key={r} value={r}>{recency[r]}</option>
          ))}
        </select>
      )}
      <Button type="submit" size="sm" variant="secondary" disabled={!name.trim()} iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}>
        {de ? "Hinzufügen" : "Add"}
      </Button>
    </form>
  );
}
