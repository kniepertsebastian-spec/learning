import { describe, expect, it } from "vitest";
import { createZabbixClient, DEFAULT_OPTIONS, provision, type ZabbixCall } from "./zabbix";

/** Minimaler Zabbix-Ersatz im Speicher: legt an, findet über filter. */
function fakeZabbix() {
  const store: Record<string, Record<string, unknown>[]> = { group: [], host: [], item: [], trigger: [] };
  const calls: string[] = [];
  let seq = 0;
  const call: ZabbixCall = async (method, params) => {
    calls.push(method);
    const [kind, action] = method.split(".");
    const table = kind === "hostgroup" ? "group" : kind;
    const idKey = kind === "hostgroup" ? "groupid" : `${kind}id`;
    if (action === "get") {
      const filter = (params.filter ?? {}) as Record<string, string[]>;
      return store[table].filter((r) => Object.entries(filter).every(([k, v]) => v.includes(r[k] as string)) && (!params.hostids || table === "trigger" || r.hostid === params.hostids));
    }
    const id = String(++seq);
    store[table].push({ ...params, [idKey]: id });
    return { [`${idKey}s`]: [id] };
  };
  return { call, store, calls };
}

describe("Zabbix-Einrichtung", () => {
  it("legt Gruppe, Host, 3 Items und 3 Trigger an", async () => {
    const z = fakeZabbix();
    const log = await provision(z.call);
    expect(z.store.group).toHaveLength(1);
    expect(z.store.host).toHaveLength(1);
    expect(z.store.item.map((i) => i.key_)).toEqual([
      "learning.app.health", "learning.app.ready", "vfs.file.time[/backups/.last-success,modify]",
    ]);
    expect(z.store.trigger).toHaveLength(3);
    expect(log).toHaveLength(8);
  });

  it("ist idempotent: der zweite Lauf legt nichts an", async () => {
    const z = fakeZabbix();
    await provision(z.call);
    const before = JSON.stringify(z.store);
    const log = await provision(z.call);
    expect(log).toEqual([]);
    expect(JSON.stringify(z.store)).toBe(before);
    expect(z.calls.filter((m) => m.endsWith(".create")).length).toBe(8);
  });

  it("HTTP-Items prüfen die richtigen Adressen und lassen auch 503 als Wert zu", async () => {
    const z = fakeZabbix();
    await provision(z.call);
    const ready = z.store.item.find((i) => i.key_ === "learning.app.ready")!;
    expect(ready.url).toBe("http://app:3000/api/ready");
    expect(ready.status_codes).toBe("");
    expect(ready.retrieve_mode).toBe(1);
    // die Vorverarbeitung macht aus dem Antwortkopf den Statuscode
    const rule = ((ready.preprocessing as { params: string }[])[0].params).split("\n");
    expect("HTTP/1.1 503 Service Unavailable".match(new RegExp(rule[0]))?.[1]).toBe("503");
    expect(rule[1]).toBe("\\1");
  });

  it("Trigger verweisen auf den Host und die Backup-Grenze (26 h = 93600 s)", async () => {
    const z = fakeZabbix();
    await provision(z.call, { ...DEFAULT_OPTIONS, hostName: "mein-host" });
    const expressions = z.store.trigger.map((t) => t.expression as string);
    expect(expressions.every((e) => e.includes("/mein-host/"))).toBe(true);
    expect(expressions.some((e) => e.includes(">93600"))).toBe(true);
  });

  it("Client: meldet sich an und sendet danach das Bearer-Token; Fehler werden geworfen", async () => {
    const seen: { auth: string | null; method: string }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      seen.push({ auth: new Headers(init.headers).get("authorization"), method: body.method });
      const out = body.method === "user.login" ? { result: "tok123" } : body.method === "boom" ? { error: { message: "Kaputt", data: "Details" } } : { result: [] };
      return new Response(JSON.stringify(out), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createZabbixClient("http://x/api_jsonrpc.php", fetchImpl);
    await client.login("Admin", "pw");
    await client.call("host.get", {});
    expect(seen[0].auth).toBeNull();
    expect(seen[1].auth).toBe("Bearer tok123");
    await expect(client.call("boom", {})).rejects.toThrow("Kaputt Details");
  });
});
