"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type FrameworkGoalRow = { id: string; code: string | null; title: string; objectiveCode: string; objectiveTitle: string; learningPath: string };

const inputClass = "rounded-md border border-border bg-background px-3 py-2 text-sm";

/** Ausbildungsrahmenplan der Firma: Einträge des eigenen Plans den Lernzielen der Lernpfade zuordnen (Mentor, Firmen-Admin). */
export function FrameworkGoalsPanel({
  goals,
  paths,
  objectivesByPath,
  locale,
}: {
  goals: FrameworkGoalRow[];
  paths: Array<{ id: string; name: string }>;
  objectivesByPath: Record<string, Array<{ id: string; code: string; title: string }>>;
  locale: "de" | "en";
}) {
  const router = useRouter();
  const de = locale === "de";
  const [pathId, setPathId] = useState(paths[0]?.id ?? "");
  const [objectiveId, setObjectiveId] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(url: string, method: string, body?: unknown): Promise<string | null> {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) return null;
    return (await res.json().catch(() => null))?.error ?? `Fehler ${res.status}`;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await send("/api/company/framework-goals", "POST", { objectiveId, code: code || null, title });
    setBusy(false);
    setError(err);
    if (!err) {
      setTitle("");
      setCode("");
      router.refresh();
    }
  }
  async function remove(id: string) {
    setError(await send(`/api/company/framework-goals/${id}`, "DELETE"));
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="framework-goals">
      <h2 className="text-lg font-medium">{de ? "Ausbildungsrahmenplan" : "Training framework"}</h2>
      <p className="mt-1 text-sm text-foreground/70">
        {de
          ? "Ordnet Lernzielen eure Einträge aus dem Ausbildungsrahmenplan zu. Wer die Lektion öffnet, sieht unter „Warum lerne ich das?“, welches Ziel eures Plans sie abdeckt."
          : "Assign your training framework entries to learning objectives. Learners see under “Why am I learning this?” which goal of your plan a lesson covers."}
      </p>
      {paths.length > 0 ? (
        <form onSubmit={create} className="mt-4 flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={pathId} onChange={(e) => { setPathId(e.target.value); setObjectiveId(""); }} aria-label={de ? "Lernpfad" : "Learning path"} data-testid="framework-path" className={inputClass}>
              {paths.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} required aria-label={de ? "Lernziel" : "Objective"} data-testid="framework-objective" className={`${inputClass} flex-1`}>
              <option value="">{de ? "Lernziel wählen" : "Choose objective"}</option>
              {(objectivesByPath[pathId] ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.code} {o.title}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} placeholder={de ? "Nr., z. B. 2.3" : "No., e.g. 2.3"} aria-label={de ? "Nummer im Plan" : "Number in the plan"} data-testid="framework-code" className={`${inputClass} sm:w-32`} />
            <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} placeholder={de ? "Eintrag im Plan, z. B. „Betriebssysteme installieren“" : "Entry in the plan"} aria-label={de ? "Eintrag im Plan" : "Entry in the plan"} data-testid="framework-title" className={`${inputClass} flex-1`} />
          </div>
          <button type="submit" disabled={busy || !objectiveId || title.trim().length < 3} data-testid="framework-create" className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50">
            {de ? "Zuordnen" : "Assign"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-foreground/70">{de ? "Es gibt noch keinen Lernpfad, dem sich Einträge zuordnen lassen." : "There is no learning path yet."}</p>
      )}
      {error && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
      {goals.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2" data-testid="framework-list">
          {goals.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm">
              <span>
                <span className="font-medium">{g.code ? `${g.code} ` : ""}{g.title}</span>
                <span className="text-foreground/70"> · {g.learningPath} · {g.objectiveCode} {g.objectiveTitle}</span>
              </span>
              <button type="button" onClick={() => void remove(g.id)} className="text-xs text-foreground/60 hover:text-danger-text">{de ? "Entfernen" : "Remove"}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
