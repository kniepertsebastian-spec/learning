"use client";

import * as React from "react";
import { RichText } from "@/components/RichText";
import { cn } from "@/lib/cn";
import type { AiProposal, ObjectiveProposal } from "@/lib/server/course-editor/ai";
import { acceptMessage, AiAssist, ProposalReview, type AcceptResult } from "./AiAssist";
import { api, Field, inputCls, Problems, useTr, type Lang } from "./shared";

/**
 * „Fehlendes Lernziel ergänzen“ aus dem Qualitätsbericht: Domain wählen, Vorschlag der KI mit Lektionen und Fragen
 * ansehen, Titel und Beschreibung anpassen, anlegen. Die Lektionen lassen sich danach wie alle anderen bearbeiten.
 */
export function MissingObjective({
  certId,
  locale,
  code,
  title,
  domains,
  suggestedDomainId,
  onCreated,
  onClose,
}: {
  certId: string;
  locale: Lang;
  code: string;
  title: string;
  domains: Array<{ id: string; name: string }>;
  suggestedDomainId: string | null;
  onCreated: (created: { objectiveId: string; sectionIds: string[] }, message: string) => void;
  onClose: () => void;
}) {
  const tr = useTr(locale);
  const [domainId, setDomainId] = React.useState(suggestedDomainId ?? domains[0]?.id ?? "");
  const [proposal, setProposal] = React.useState<(ObjectiveProposal & AiProposal) | null>(null);
  const [meta, setMeta] = React.useState({ title: "", description: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function accept() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    const r = await api<{ objectiveId: string; sectionIds: string[] } & AcceptResult>(`/api/admin/certifications/${certId}/workshop/ai/objective`, {
      method: "POST",
      body: { domainId: proposal.domainId, code: proposal.code, title: meta.title, description: meta.description, sections: proposal.sections, questions: proposal.questions },
    });
    setBusy(false);
    if (!r.ok) return setError(r.problems?.length ? `${r.error} ${r.problems.join(" ")}` : r.error);
    onCreated(r.data, `${tr(`Lernziel ${proposal.code} angelegt.`, `Objective ${proposal.code} created.`)} ${acceptMessage(r.data, tr)}`);
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-accent-border bg-surface p-4" data-testid="missing-objective">
      <p className="text-sm">
        <span className="font-mono text-xs">{code}</span> <span className="font-medium">{title}</span>
      </p>
      {!proposal && (
        <>
          <Field label={tr("Domain", "Domain")} className="max-w-md">
            <select className={inputCls} value={domainId} onChange={(e) => setDomainId(e.target.value)} data-testid="missing-domain">
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          {domainId && (
            <AiAssist
              key={domainId}
              certId={certId}
              locale={locale}
              target={{ target: "missing-objective", domainId, code, title }}
              actions={["add_objective"]}
              initialAction="add_objective"
              onProposal={(p) => {
                if (p.kind !== "objective") return;
                setProposal(p);
                setMeta({ title: p.title, description: p.description });
              }}
            />
          )}
          <button type="button" className="self-start text-sm text-subtle underline" onClick={onClose}>{tr("Abbrechen", "Cancel")}</button>
        </>
      )}
      {proposal && (
        <ProposalReview locale={locale} proposal={proposal} translated={false} busy={busy || !meta.title.trim()} onAccept={() => void accept()} onDiscard={() => setProposal(null)} acceptLabel={tr("Lernziel anlegen", "Create objective")}>
          {error && <Problems title={error} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr("Titel", "Title")}>
              <input className={inputCls} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} maxLength={300} data-testid="missing-title" />
            </Field>
            <Field label={tr("Beschreibung", "Description")}>
              <input className={inputCls} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={1000} />
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            {proposal.sections.map((s, i) => (
              <details key={i} className="rounded-xl border border-border" open={i === 0}>
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                  {tr("Lektion", "Lesson")} {i + 1}: {s.title[proposal.locale]}
                </summary>
                <div className="max-h-[50vh] overflow-y-auto border-t border-border bg-background p-4 text-[15px] leading-relaxed">
                  <RichText text={s.content[proposal.locale]} headingIds />
                </div>
              </details>
            ))}
          </div>
          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              {proposal.questions.length} {tr("Fragen", "questions")}
            </summary>
            <ol className="flex flex-col gap-2 border-t border-border p-3 text-sm">
              {proposal.questions.map((q, i) => (
                <li key={i}>
                  <RichText text={q.question[proposal.locale]} />
                  <ul className="mt-0.5">
                    {q.options.map((o, k) => (
                      <li key={k} className={cn(o.isCorrect && "font-semibold text-mint-text")}>{o.isCorrect ? "✓" : "·"} {o.text[proposal.locale]}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </details>
          <p className="text-xs text-faint">{tr("Lektionen und Fragen lassen sich nach dem Anlegen wie alle anderen bearbeiten.", "Lessons and questions can be edited like any others after creating them.")}</p>
        </ProposalReview>
      )}
    </div>
  );
}
