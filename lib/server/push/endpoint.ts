import { allowedPushHosts } from "./config";

/**
 * Der Server schickt an die Adresse, die der Browser beim Abonnieren meldet. Damit niemand den Server per erfundener Adresse dazu bringt,
 * interne Dienste anzusprechen (SSRF), gilt eine Allowlist: nur https und nur die Hosts der Push-Dienste der Browser (oder ihre Unterdomänen).
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return allowedPushHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
