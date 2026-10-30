"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Roles = "company_admin" | "mentor" | "learner";
export type SsoViewProps = {
  configured: boolean;
  enabled: boolean;
  issuer: string;
  clientId: string;
  hasSecret: boolean;
  groupsClaim: string;
  roleMappings: Record<Roles, string[]>;
  enforceSso: boolean;
  redirectUri: string | null;
  encryptionConfigured: boolean;
  domains: { id: string; domain: string; verified: boolean; recordName: string; recordValue: string }[];
};

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";
const ROLE_LABEL: Record<Roles, string> = { company_admin: "Firmen-Admin", mentor: "Mentor", learner: "Lernende" };

async function call(url: string, method: string, body?: unknown): Promise<{ error: string | null; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return res.ok ? { error: null, data } : { error: data?.error ?? `Fehler ${res.status}`, data: null };
}

const toList = (text: string) => text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

/**
 * Anmeldung über das Firmenkonto (OIDC): Domains bestätigen, Anmeldedienst eintragen, Gruppen den Rollen zuordnen. Nur für den
 * Firmen-Admin. Das Geheimnis wird nie angezeigt; leer lassen heißt „behalten“.
 */
export function SsoPanel({ view }: { view: SsoViewProps }) {
  const router = useRouter();
  const [issuer, setIssuer] = useState(view.issuer);
  const [clientId, setClientId] = useState(view.clientId);
  const [secret, setSecret] = useState("");
  const [groupsClaim, setGroupsClaim] = useState(view.groupsClaim);
  const [groups, setGroups] = useState<Record<Roles, string>>({
    company_admin: view.roleMappings.company_admin.join("\n"),
    mentor: view.roleMappings.mentor.join("\n"),
    learner: view.roleMappings.learner.join("\n"),
  });
  const [enabled, setEnabled] = useState(view.enabled);
  const [enforce, setEnforce] = useState(view.enforceSso);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const anyVerified = view.domains.some((d) => d.verified);

  async function run(fn: () => Promise<{ error: string | null; data: Record<string, unknown> | null }>, ok?: (data: Record<string, unknown> | null) => string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err, data } = await fn();
    setBusy(false);
    if (err) return setError(err);
    setNotice(ok?.(data) ?? null);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="sso-panel">
      <h2 className="text-lg font-medium">Anmeldung über das Firmenkonto (SSO)</h2>
      <p className="mt-1 text-sm text-muted">
        Mitarbeitende melden sich mit dem Firmenkonto an (OpenID Connect: Microsoft Entra ID, Okta, Google Workspace, Keycloak …). Wer sich mit einer bestätigten Firmen-Domain anmeldet, wird automatisch Mitglied; die Rolle ergibt sich bei jeder Anmeldung aus den Gruppen im Anmeldedienst. Einladungen sind dann nicht nötig.
      </p>
      {error && <p role="alert" data-testid="sso-admin-error" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-md bg-success-soft px-3 py-2 text-sm text-success-text">{notice}</p>}

      <h3 className="mt-5 font-medium">1. E-Mail-Domains bestätigen</h3>
      <p className="text-sm text-muted">Nur Adressen bestätigter Domains können sich anmelden. Zur Bestätigung einen DNS-TXT-Eintrag setzen und danach „Prüfen“ klicken.</p>
      <ul className="mt-2 flex flex-col gap-2" data-testid="sso-domains">
        {view.domains.map((d) => (
          <li key={d.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{d.domain} <span className={d.verified ? "text-success-text" : "text-warning-text"}>{d.verified ? "· bestätigt" : "· noch nicht bestätigt"}</span></span>
              <span className="flex gap-2">
                {!d.verified && <button type="button" className={btn} disabled={busy} data-testid="sso-verify" onClick={() => void run(async () => { const r = await call(`/api/company/sso/domains/${d.id}/verify`, "POST"); if (!r.error && r.data?.verified !== true) return { error: "Der DNS-Eintrag wurde noch nicht gefunden (Änderungen im DNS können etwas dauern).", data: null }; return r; }, () => "Domain bestätigt.")}>Prüfen</button>}
                <button type="button" className={btn} disabled={busy} onClick={() => void run(() => call(`/api/company/sso/domains/${d.id}`, "DELETE"))}>Entfernen</button>
              </span>
            </div>
            {!d.verified && (
              <p className="mt-2 break-all text-xs text-muted">
                TXT-Eintrag: Name <code>{d.recordName}</code>, Wert <code>{d.recordValue}</code>
              </p>
            )}
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => call("/api/company/sso/domains", "POST", { domain }), () => { setDomain(""); return null; }); }}>
        <input className={field} placeholder="firma.de" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain" data-testid="sso-domain-input" />
        <button type="submit" className={btn} disabled={busy || !domain.trim()}>Hinzufügen</button>
      </form>

      <h3 className="mt-6 font-medium">2. Anmeldedienst eintragen</h3>
      {view.redirectUri && <p className="text-sm text-muted">Im Anmeldedienst als Weiterleitungs-Adresse (Redirect URI) eintragen: <code className="break-all">{view.redirectUri}</code></p>}
      {!view.encryptionConfigured && <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-sm">Auf dem Server fehlt APP_ENCRYPTION_KEY: das Geheimnis lässt sich nicht speichern.</p>}
      <form className="mt-2 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => call("/api/company/sso", "PUT", { issuer, clientId, clientSecret: secret || null, groupsClaim, roleMappings: { company_admin: toList(groups.company_admin), mentor: toList(groups.mentor), learner: toList(groups.learner) }, enabled, enforceSso: enforce }), () => { setSecret(""); return "Gespeichert."; }); }}>
        <label className="text-sm font-medium">Aussteller (Issuer)
          <input className={`${field} mt-1`} value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://login.microsoftonline.com/<Verzeichnis-ID>/v2.0" data-testid="sso-issuer" />
        </label>
        <label className="text-sm font-medium">Client-ID
          <input className={`${field} mt-1`} value={clientId} onChange={(e) => setClientId(e.target.value)} data-testid="sso-client-id" />
        </label>
        <label className="text-sm font-medium">Client-Geheimnis {view.hasSecret && <span className="font-normal text-subtle">(gespeichert; leer lassen = behalten)</span>}
          <input className={`${field} mt-1`} type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} data-testid="sso-secret" />
        </label>
        <label className="text-sm font-medium">Name des Gruppen-Anspruchs (Claim)
          <input className={`${field} mt-1`} value={groupsClaim} onChange={(e) => setGroupsClaim(e.target.value)} />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Gruppen den Rollen zuordnen (eine pro Zeile; Entra: Gruppen-Objekt-IDs)</legend>
          {(["company_admin", "mentor", "learner"] as const).map((role) => (
            <label key={role} className="text-sm">{ROLE_LABEL[role]}
              <textarea className={`${field} mt-1`} rows={2} value={groups[role]} onChange={(e) => setGroups({ ...groups, [role]: e.target.value })} data-testid={`sso-groups-${role}`} />
            </label>
          ))}
          <p className="text-xs text-muted">Wer keiner Gruppe zugeordnet ist, wird Lernende/r. Gilt mehrere, zählt die höchste Rolle. Der letzte Firmen-Admin wird nie herabgestuft.</p>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={!anyVerified} onChange={(e) => { setEnabled(e.target.checked); if (!e.target.checked) setEnforce(false); }} data-testid="sso-enabled" /> Anmeldung über das Firmenkonto einschalten {!anyVerified && <span className="text-subtle">(erst nach einer bestätigten Domain)</span>}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enforce} disabled={!enabled} onChange={(e) => setEnforce(e.target.checked)} data-testid="sso-enforce" /> Passwort-Anmeldung für Mitglieder sperren (Firmen-Admins behalten sie als Notzugang)</label>
        <div><button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50" disabled={busy} data-testid="sso-save">Speichern</button></div>
      </form>
    </section>
  );
}
