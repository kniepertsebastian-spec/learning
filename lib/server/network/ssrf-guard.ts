import { BlockList, type LookupFunction } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * R1.1 (roadmap.md): Sicherheitsvoraussetzung für URL-Quellenimport - ein
 * Admin gibt eine beliebige URL an, die der Server serverseitig abruft
 * (SSRF-Risiko: die URL könnte auf interne Netzwerkziele zeigen, z. B.
 * Cloud-Metadata-Endpunkte 169.254.169.254 oder interne Admin-Panels).
 * `net.BlockList` (Node-Bordmittel, keine neue Abhängigkeit) matcht auch
 * IPv4-in-IPv6-gemappte Adressen korrekt gegen IPv4-Subnetze, siehe Test in
 * der PR-Beschreibung.
 */
export class UnsafeUrlError extends Error {}

export type ResolvedAddress = { address: string; family: number };
/** DNS-Auflösung eines Hostnamens (alle Adressen). Austauschbar, damit Tests ohne Netz auskommen. */
export type ResolveFn = (hostname: string) => Promise<ResolvedAddress[]>;
const defaultResolve: ResolveFn = (hostname) => lookup(hostname, { all: true });

const PRIVATE_IPV4_SUBNETS: Array<[address: string, prefix: number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // Loopback
  ["169.254.0.0", 16], // Link-local, inkl. Cloud-Metadata (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF-Protokollzuweisungen
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // Benchmark
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // Multicast
  ["240.0.0.0", 4], // Reserviert
  ["255.255.255.255", 32], // Broadcast
];

const PRIVATE_IPV6_SUBNETS: Array<[address: string, prefix: number]> = [
  ["::", 128], // Unspecified
  ["::1", 128], // Loopback
  ["fc00::", 7], // Unique Local
  ["fe80::", 10], // Link-local
  ["fec0::", 10], // Site-local (veraltet, aber noch geroutet)
  ["ff00::", 8], // Multicast
  ["100::", 64], // Discard-only
  ["2001::", 32], // Teredo (tunnelt IPv4, auch private Ziele)
  ["2001:db8::", 32], // Dokumentation
  ["2002::", 16], // 6to4 (bettet eine IPv4-Adresse ein)
  ["64:ff9b::", 96], // NAT64: bildet IPv4 auf IPv6 ab, Ziel könnte 10.x.x.x sein
  ["64:ff9b:1::", 48], // NAT64, lokal nutzbar
];

function buildBlockList(): BlockList {
  const blockList = new BlockList();
  for (const [address, prefix] of PRIVATE_IPV4_SUBNETS) {
    blockList.addSubnet(address, prefix, "ipv4");
  }
  for (const [address, prefix] of PRIVATE_IPV6_SUBNETS) {
    blockList.addSubnet(address, prefix, "ipv6");
  }
  return blockList;
}

const blockList = buildBlockList();

export function isPrivateOrReservedIp(ip: string, family: "ipv4" | "ipv6"): boolean {
  return blockList.check(ip, family);
}

/**
 * Wirft UnsafeUrlError, wenn die URL kein erlaubtes http(s)-Schema hat oder
 * (irgend-)eine ihrer aufgelösten IP-Adressen in einen privaten/reservierten
 * Bereich fällt. Prüft ALLE von DNS zurückgegebenen Adressen (nicht nur die
 * erste), da Round-Robin-DNS mehrere Ergebnisse liefern kann.
 */
export async function assertPublicHttpUrl(url: string, resolve: ResolveFn = defaultResolve): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError(`"${url}" ist keine gültige URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError(`Nur http(s)-URLs sind erlaubt, nicht "${parsed.protocol}".`);
  }
  if (parsed.hostname === "localhost") {
    throw new UnsafeUrlError(`"${url}" zeigt auf localhost, das ist nicht erlaubt.`);
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(parsed.hostname);
  } catch (error) {
    throw new UnsafeUrlError(
      `Hostname von "${url}" konnte nicht aufgelöst werden: ${(error as Error).message}`,
    );
  }

  for (const { address, family } of addresses) {
    if (isPrivateOrReservedIp(address, family === 6 ? "ipv6" : "ipv4")) {
      throw new UnsafeUrlError(
        `"${url}" löst auf eine private/interne Netzwerkadresse auf (${address}) - nicht erlaubt.`,
      );
    }
  }
}

/**
 * `lookup` für den Verbindungsaufbau (Option von http.request/net.connect): Die Prüfung findet bei der Auflösung statt,
 * die das Socket tatsächlich benutzt, und die geprüfte Adresse ist die, mit der verbunden wird. Eine vorab gemachte
 * Prüfung allein (assertPublicHttpUrl) genügt nicht: ein Angreifer-DNS kann bei der ersten Frage eine öffentliche und bei der
 * zweiten (der des Abrufs) eine interne Adresse liefern („DNS-Rebinding“). Liefert der Name mindestens eine private
 * Adresse, wird die Verbindung abgelehnt, nicht nur die private Adresse übersprungen: ein Angreifer soll keinen Namen
 * halb intern aufstellen können.
 */
export function createGuardedLookup(resolve: ResolveFn = defaultResolve): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) {
          callback(Object.assign(new Error(`Hostname "${hostname}" ließ sich nicht auflösen.`), { code: "ENOTFOUND" }), "", 0);
          return;
        }
        const blocked = addresses.find(({ address, family }) => isPrivateOrReservedIp(address, family === 6 ? "ipv6" : "ipv4"));
        if (blocked) {
          callback(new UnsafeUrlError(`"${hostname}" löst auf eine private/interne Netzwerkadresse auf (${blocked.address}) - nicht erlaubt.`), "", 0);
          return;
        }
        const wanted = typeof options.family === "number" && options.family !== 0 ? addresses.filter((a) => a.family === options.family) : addresses;
        if (wanted.length === 0) {
          callback(Object.assign(new Error(`Keine passende Adresse für "${hostname}".`), { code: "ENOTFOUND" }), "", 0);
          return;
        }
        if (options.all) callback(null, wanted.map(({ address, family }) => ({ address, family })));
        else callback(null, wanted[0].address, wanted[0].family);
      },
      (error: Error) => callback(error, "", 0),
    );
  };
}
