/**
 * Richtet in Zabbix den Host der Lernplattform samt Prüfpunkten und Alarmen ein (docs/MONITORING.md).
 * Idempotent: bereits vorhandene Gruppen, Hosts, Items und Trigger werden nicht noch einmal angelegt,
 * ein zweiter Lauf ändert nichts. Die Logik hängt nur an einer `call`-Funktion, damit sie ohne
 * Zabbix-Server testbar ist (lib/server/ops/zabbix.test.ts).
 */
export type ZabbixCall = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export interface ProvisionOptions {
  /** Name des Hosts in Zabbix; muss dem ZBX_HOSTNAME des Agenten entsprechen. */
  hostName: string;
  groupName: string;
  /** Adresse der App aus Sicht des Zabbix-Servers (Docker-Netz), ohne Schluss-Slash. */
  appUrl: string;
  /** Pfad der Marker-Datei, die backup.sh nach jedem erfolgreichen Lauf anfasst (aus Sicht des Agenten). */
  backupMarker: string;
  /** Höchstalter des Backups in Sekunden, danach Alarm (Standard: 26 h). */
  backupMaxAgeSeconds: number;
}

export const DEFAULT_OPTIONS: ProvisionOptions = {
  hostName: "learning-app",
  groupName: "Learning",
  appUrl: "http://app:3000",
  backupMarker: "/backups/.last-success",
  backupMaxAgeSeconds: 26 * 3600,
};

// Zabbix-Typen: 19 = HTTP-Agent, 7 = Zabbix-Agent (aktiv); value_type 3 = Ganzzahl.
const ITEM_HTTP_AGENT = 19;
const ITEM_AGENT_ACTIVE = 7;
const VALUE_UINT = 3;
const PRIORITY_HIGH = 4;
// Antwortkopf "HTTP/1.1 503 Service Unavailable" -> 503. Antworten außerhalb 2xx lässt der Server
// mit status_codes "" zu, damit 503 als Wert ankommt und nicht als "nicht unterstützt".
const STATUS_REGEX = "HTTP/[0-9.]+ ([0-9]{3})\n\\1";

type Row = Record<string, string>;

async function rows(call: ZabbixCall, method: string, params: Record<string, unknown>): Promise<Row[]> {
  return (await call(method, params)) as Row[];
}

async function ensure<T>(existing: T | undefined, create: () => Promise<T>): Promise<{ value: T; created: boolean }> {
  if (existing !== undefined) return { value: existing, created: false };
  return { value: await create(), created: true };
}

export async function provision(call: ZabbixCall, options: ProvisionOptions = DEFAULT_OPTIONS): Promise<string[]> {
  const log: string[] = [];
  const o = options;

  const group = await ensure((await rows(call, "hostgroup.get", { filter: { name: [o.groupName] } }))[0]?.groupid, async () =>
    ((await call("hostgroup.create", { name: o.groupName })) as { groupids: string[] }).groupids[0]);
  if (group.created) log.push(`Gruppe ${o.groupName} angelegt`);

  const host = await ensure((await rows(call, "host.get", { filter: { host: [o.hostName] } }))[0]?.hostid, async () =>
    ((await call("host.create", { host: o.hostName, groups: [{ groupid: group.value }] })) as { hostids: string[] }).hostids[0]);
  if (host.created) log.push(`Host ${o.hostName} angelegt`);
  const hostid = host.value;

  const items = [
    {
      key_: "learning.app.health", name: "App: Prozess läuft (HTTP-Status von /api/health)",
      type: ITEM_HTTP_AGENT, url: `${o.appUrl}/api/health`, retrieve_mode: 1, status_codes: "", timeout: "5s", delay: "1m",
    },
    {
      key_: "learning.app.ready", name: "App: bereit inkl. Datenbank (HTTP-Status von /api/ready)",
      type: ITEM_HTTP_AGENT, url: `${o.appUrl}/api/ready`, retrieve_mode: 1, status_codes: "", timeout: "5s", delay: "1m",
    },
    {
      key_: `vfs.file.time[${o.backupMarker},modify]`, name: "Backup: Zeitpunkt des letzten erfolgreichen Laufs",
      type: ITEM_AGENT_ACTIVE, delay: "15m",
    },
  ];
  for (const item of items) {
    const existing = (await rows(call, "item.get", { hostids: hostid, filter: { key_: [item.key_] } }))[0];
    if (existing) continue;
    const isHttp = item.type === ITEM_HTTP_AGENT;
    await call("item.create", {
      hostid, value_type: VALUE_UINT, ...item,
      ...(isHttp ? { preprocessing: [{ type: "5", params: STATUS_REGEX, error_handler: "0", error_handler_params: "" }] } : {}),
    });
    log.push(`Item ${item.key_} angelegt`);
  }

  const h = o.hostName;
  const backupKey = `vfs.file.time[${o.backupMarker},modify]`;
  const triggers = [
    { description: "Lernplattform antwortet nicht", expression: `count(/${h}/learning.app.health,3m,"ne",200)>=3 or nodata(/${h}/learning.app.health,5m)=1` },
    { description: "Lernplattform: Datenbank nicht erreichbar", expression: `count(/${h}/learning.app.ready,3m,"ne",200)>=3 or nodata(/${h}/learning.app.ready,5m)=1` },
    { description: `Backup älter als ${Math.round(o.backupMaxAgeSeconds / 3600)} Stunden oder nie gelaufen`, expression: `now()-last(/${h}/${backupKey})>${o.backupMaxAgeSeconds} or nodata(/${h}/${backupKey},${Math.round(o.backupMaxAgeSeconds / 3600) + 2}h)=1` },
  ];
  for (const t of triggers) {
    const existing = (await rows(call, "trigger.get", { hostids: hostid, filter: { description: [t.description] } }))[0];
    if (existing) continue;
    await call("trigger.create", { ...t, priority: PRIORITY_HIGH });
    log.push(`Trigger „${t.description}“ angelegt`);
  }
  return log;
}

/** Spricht die Zabbix-JSON-RPC-Schnittstelle (7.0): Anmeldung, dann Bearer-Token. */
export function createZabbixClient(url: string, fetchImpl: typeof fetch = fetch) {
  let token: string | undefined;
  let id = 0;
  const call: ZabbixCall = async (method, params) => {
    const headers: Record<string, string> = { "Content-Type": "application/json-rpc" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method, params, id: ++id }) });
    if (!res.ok) throw new Error(`Zabbix antwortet mit HTTP ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { message: string; data?: string } };
    if (body.error) throw new Error(`Zabbix ${method}: ${body.error.message} ${body.error.data ?? ""}`.trim());
    return body.result;
  };
  return {
    call,
    async login(username: string, password: string) {
      token = (await call("user.login", { username, password })) as string;
    },
  };
}
