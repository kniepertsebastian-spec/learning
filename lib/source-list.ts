/**
 * Liste von Quellen-URLs aus einem Textfeld (eine je Zeile) für das Sammel-Hinzufügen unter „Offizielle Quellen verwalten“.
 * Zeilenformate: `https://…`, `Titel | https://…` oder `https://… | Titel`. Leere Zeilen und `#`-Kommentare werden ignoriert.
 * Ohne Titel wird er aus der Adresse abgeleitet (Dateiname ohne Endung, sonst Hostname). Doppelte Adressen zählen einmal.
 */
export type SourceListItem = { title: string; url: string };
export type SourceListResult = { items: SourceListItem[]; invalid: string[]; duplicates: number };

export const MAX_BULK_SOURCES = 100;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Titel aus einer Adresse: letzter Pfadabschnitt ohne Endung, `_`/`+`/`%20` als Leerzeichen (Bindestriche bleiben, z. B. „SY0-701“); sonst der Hostname. */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) {
      const decoded = decodeURIComponent(last).replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_+]+/g, " ").replace(/\s+/g, " ").trim();
      if (decoded) return decoded;
    }
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Dateiname ohne `.pdf` als Titel einer hochgeladenen Datei. */
export function titleFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_+]+/g, " ").replace(/\s+/g, " ").trim() || name;
}

export function parseSourceList(text: string): SourceListResult {
  const items: SourceListItem[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let url = "";
    let title = "";
    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      url = parts.find(isHttpUrl) ?? "";
      title = parts.filter((p) => p !== url).join(" ").trim();
    } else {
      const [first, ...rest] = line.split(/\s+/);
      url = first;
      title = rest.join(" ").trim();
    }
    if (!isHttpUrl(url)) {
      invalid.push(line);
      continue;
    }
    const key = url.replace(/#.*$/, "");
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    items.push({ title: (title || titleFromUrl(url)).slice(0, 200), url });
  }
  return { items, invalid, duplicates };
}
