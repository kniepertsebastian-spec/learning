/**
 * Holt alle Web-Adressen aus beliebigem Text (eingefügte Liste, Markdown-Links, Fließtext, Komma- oder Leerzeichen-getrennt).
 * Eine Adresse wird von „http(s)://“ bis zum nächsten Leerraum, Anführungszeichen oder spitzen Klammer erkannt; Satzzeichen
 * am Ende (Punkt, Komma, Klammer zu) gehören nicht dazu. Doppelte fallen weg, die Reihenfolge bleibt.
 */
export function extractUrls(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/https?:\/\/(?:(?!https?:\/\/)[^\s<>"'`])+/gi)) {
    let url = match[0];
    // Markdown „[Text](https://…)“: die schließende Klammer gehört nur dazu, wenn eine öffnende in der Adresse steht.
    while (/[.,;:!?)\]}]$/.test(url) && !(url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0))) url = url.slice(0, -1);
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes(".")) found.push(url);
    } catch {
      // keine gültige Adresse
    }
  }
  return found.filter((url, index) => found.indexOf(url) === index);
}

/** Kurzform für die Anzeige: Domain und der letzte Teil des Pfads. */
export function describeUrl(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return { host: u.hostname.replace(/^www\./, ""), path: last };
  } catch {
    return { host: url, path: "" };
  }
}
