/**
 * Mehr Abwechslung im Fragenpool (roadmap3.md, Ideen): Die KI setzt die richtige Antwort meist an dieselbe Stelle und
 * stellt bei großen Kursen ähnliche Fragen mehrfach. Beides lässt sich ohne KI beheben.
 */

/** Stabile Pseudozufallszahlen aus einem Text (gleiche Frage → gleiche Reihenfolge, auch nach erneutem Import). */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Optionen, deren Sinn an ihrer Reihenfolge hängt („alle oben genannten“, „A und B“) oder auf die die Erklärung per Buchstabe verweist. */
const ORDER_DEPENDENT = /\b(all|none) of the above\b|\b(alle|keine) (der )?(oben|genannten|obigen)\b|\bbeide (oben|obigen)\b|\bboth [A-D] and [A-D]\b|\b[A-D] (und|and|&) [A-D]\b/i;
const LETTER_REFERENCE = /\b(Antwort|Option|Answer|choice)\s*\(?[A-D]\)?(?![\w-])/;

export function orderMatters(options: Array<{ text: { de: string; en: string } }>, explanation: { de: string; en: string }): boolean {
  return options.some((o) => ORDER_DEPENDENT.test(o.text.de) || ORDER_DEPENDENT.test(o.text.en)) || LETTER_REFERENCE.test(explanation.de) || LETTER_REFERENCE.test(explanation.en);
}

/**
 * Antwortoptionen stabil gemischt (Fisher-Yates mit `seed`), damit die richtige Antwort nicht immer an derselben Stelle
 * steht. Bleibt unverändert, wenn die Reihenfolge eine Bedeutung hat.
 */
export function shuffleOptions<T extends { text: { de: string; en: string } }>(options: T[], explanation: { de: string; en: string }, seed: string): T[] {
  if (options.length < 2 || orderMatters(options, explanation)) return options;
  const rnd = seeded(seed);
  const out = [...options];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const words = (text: string) => new Set(text.toLowerCase().replace(/```[\s\S]*?```/g, " ").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));

/**
 * Fast gleiche Fragen (dieselbe Frage mit anderen Worten umgestellt): Anteil gemeinsamer Wörter (Jaccard) ab 0,8.
 * Sehr kurze Fragen zählen nur bei exakter Gleichheit, sonst wären „Was ist X?“ und „Was ist Y?“ Dubletten.
 */
export function nearDuplicate(a: string, b: string, threshold = 0.8): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.size < 5 || wb.size < 5) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / (wa.size + wb.size - common) >= threshold;
}

/** Prompt-Regeln für abwechslungsreiche Fragen (Erzeugung und Werkstatt). */
export const QUESTION_VARIETY_PROMPT = [
  "Abwechslung im Fragenpool: verteile die Fragen auf mindestens drei Fragetypen (bei 4 Fragen mindestens zwei), höchstens die Hälfte vom selben Typ.",
  "Jede Frage prüft einen anderen Aspekt oder eine andere Situation; formuliere nicht dieselbe Frage mit anderen Worten.",
  "Variiere die Frageform (Was passiert …? Was tust du als Nächstes? Woran liegt es? Welche Einstellung …?) und die Länge der Antworten: die richtige Antwort ist nicht systematisch die längste.",
  "Erklärungen nennen die richtige Antwort inhaltlich, nie per Buchstabe (die Reihenfolge der Antworten wird gemischt).",
];
