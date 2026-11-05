/**
 * Web Push im Service Worker (app/sw.ts): die Nachricht des Servers prüfen und das Ziel eines Klicks bestimmen. Reine Funktionen, damit
 * sie ohne Browser testbar sind. Der Server schickt `{ title, body, url, tag }` (lib/push/logic.ts); der Service Worker traut dem
 * Inhalt trotzdem nicht blind: nur Texte, nur Pfade der eigenen App.
 */

export interface ShownPush {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const FALLBACK: ShownPush = { title: "Knowvia", body: "", url: "/", tag: "default" };

/** Ein App-Pfad („/exams“), nie eine fremde Adresse („//evil.example“, „https://…“, „javascript:…“). */
export function safeAppPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\u0000-\u001f]/.test(value)) return "/";
  return value.slice(0, 300);
}

/** Liest die Nachricht; bei kaputten oder fehlenden Daten kommt trotzdem eine neutrale Benachrichtigung (Browser verlangen, dass jede Push-Nachricht etwas anzeigt). */
export function parsePush(raw: string | null | undefined): ShownPush {
  if (!raw) return { ...FALLBACK };
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const title = text(data.title, 120) || FALLBACK.title;
    return { title, body: text(data.body, 300), url: safeAppPath(data.url), tag: text(data.tag, 60) || FALLBACK.tag };
  } catch {
    return { ...FALLBACK };
  }
}
