/** Statische Grafik (SVG) zur Pausen-Simulation: Minuten pro Tag als zwei Linien, Zeitbudget als waagerechte Linie, Pause als hinterlegter Bereich, Annahmen als Fußzeile. */
import type { PauseScenario } from "./pause-scenario";

const W = 900;
const H = 480;
const M = { left: 64, right: 24, top: 64, bottom: 110 };
const COLORS = { vanilla: "#c2410c", planning: "#0f766e", budget: "#475569", pause: "#e2e8f0", text: "#0f172a", grid: "#cbd5e1" };

const TEXT = {
  de: {
    title: "Eine Woche Pause: Was danach auf dich wartet",
    subtitle: "Lernzeit pro Tag, gleiche Person, gleicher Zufall",
    vanilla: "Klassische Lernkarten-App (reines FSRS)",
    planning: "Mit Planungsschicht",
    budget: "Zeitbudget",
    pause: "Pause",
    x: "Tage",
    y: "Minuten pro Tag",
    footer: (s: PauseScenario) =>
      `Annahmen: ${s.assumptions.totalCards} Karten, ${s.assumptions.newCardsPerDay} neue pro Tag, ${s.assumptions.timeBudgetMin} min Zeitbudget, ${s.assumptions.secondsPerReview} s je Karte, ${s.assumptions.leadInDays} Tage Vorlauf, ${s.assumptions.pauseDays} Tage Pause, Ziel-Behaltensquote ${Math.round(s.assumptions.rTarget * 100)} %. Synthetische Simulation, keine Nutzerdaten.`,
    peak: (m: number) => `${m} min`,
  },
  en: {
    title: "A week off: what waits for you afterwards",
    subtitle: "Study time per day, same person, same randomness",
    vanilla: "Classic flashcard app (plain FSRS)",
    planning: "With planning layer",
    budget: "Time budget",
    pause: "Break",
    x: "Days",
    y: "Minutes per day",
    footer: (s: PauseScenario) =>
      `Assumptions: ${s.assumptions.totalCards} cards, ${s.assumptions.newCardsPerDay} new per day, ${s.assumptions.timeBudgetMin} min time budget, ${s.assumptions.secondsPerReview} s per card, ${s.assumptions.leadInDays} days lead-in, ${s.assumptions.pauseDays} days break, target retention ${Math.round(s.assumptions.rTarget * 100)} %. Synthetic simulation, no user data.`,
    peak: (m: number) => `${m} min`,
  },
} as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Zeigt die Tage ab `fromDay` (Standard: ein paar Tage vor der Pause), damit die Pause nicht im langen Vorlauf untergeht. */
export function renderPauseSvg(scenario: PauseScenario, lang: "de" | "en" = "de", fromDay = Math.max(0, scenario.pauseStartDay - 14)): string {
  const t = TEXT[lang];
  const days = scenario.modes.planning.minutesByDay.length;
  const span = Math.max(1, days - 1 - fromDay);
  const rawMax = Math.max(scenario.assumptions.timeBudgetMin * 1.2, ...scenario.modes.vanilla.minutesByDay.slice(fromDay), ...scenario.modes.planning.minutesByDay.slice(fromDay)) * 1.05;
  // runde Achsenschritte (5, 10, 20, 50 ...), Obergrenze auf ein Vielfaches des Schritts
  const step = [5, 10, 15, 20, 25, 30, 50, 100, 200, 500].find((s) => rawMax / s <= 6) ?? 1000;
  const maxY = Math.ceil(rawMax / step) * step;
  const x = (day: number) => M.left + ((day - fromDay) / span) * (W - M.left - M.right);
  const y = (min: number) => H - M.bottom - (min / maxY) * (H - M.top - M.bottom);
  const line = (values: number[]) => values.slice(fromDay).map((v, i) => `${f(x(fromDay + i))},${f(y(v))}`).join(" ");

  const ticks = Array.from({ length: Math.round(maxY / step) + 1 }, (_, i) => i * step);
  const pauseX1 = x(scenario.pauseStartDay);
  const pauseX2 = x(scenario.firstDayAfterPause);
  const vanillaPeak = scenario.metrics.vanilla.peakMinutesFirstDayAfterPause;
  const planningPeak = scenario.metrics.planning.peakMinutesFirstDayAfterPause;
  const peakX = x(scenario.firstDayAfterPause);
  const labelX = Math.min(peakX + 8, W - M.right - 60);
  const budgetY = y(scenario.assumptions.timeBudgetMin);
  const footer = t.footer(scenario);
  // an Wortgrenzen umbrechen
  const wrapped: string[] = [];
  let current = "";
  for (const word of footer.split(" ")) {
    if ((current + " " + word).trim().length > 118) {
      wrapped.push(current);
      current = word;
    } else current = (current + " " + word).trim();
  }
  if (current) wrapped.push(current);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d" font-family="system-ui, sans-serif">
  <title id="t">${esc(t.title)}</title>
  <desc id="d">${esc(`${t.vanilla}: ${vanillaPeak} min, ${t.planning}: ${planningPeak} min`)}</desc>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="${M.left}" y="30" font-size="20" font-weight="600" fill="${COLORS.text}">${esc(t.title)}</text>
  <text x="${M.left}" y="50" font-size="13" fill="${COLORS.budget}">${esc(t.subtitle)}</text>
  <rect x="${f(pauseX1)}" y="${M.top}" width="${f(pauseX2 - pauseX1)}" height="${H - M.top - M.bottom}" fill="${COLORS.pause}"/>
  <text x="${f((pauseX1 + pauseX2) / 2)}" y="${M.top + 14}" font-size="12" text-anchor="middle" fill="${COLORS.budget}">${esc(t.pause)}</text>
${ticks.map((v) => `  <line x1="${M.left}" x2="${W - M.right}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="${COLORS.grid}" stroke-width="0.5"/>\n  <text x="${M.left - 8}" y="${f(y(v) + 4)}" font-size="11" text-anchor="end" fill="${COLORS.budget}">${v}</text>`).join("\n")}
  <line x1="${M.left}" x2="${W - M.right}" y1="${f(budgetY)}" y2="${f(budgetY)}" stroke="${COLORS.budget}" stroke-width="1.5" stroke-dasharray="6 4"/>
  <text x="${W - M.right}" y="${f(budgetY - 6)}" font-size="12" text-anchor="end" fill="${COLORS.budget}">${esc(`${t.budget}: ${scenario.assumptions.timeBudgetMin} min`)}</text>
  <polyline points="${line(scenario.modes.vanilla.minutesByDay)}" fill="none" stroke="${COLORS.vanilla}" stroke-width="2.5" stroke-linejoin="round"/>
  <polyline points="${line(scenario.modes.planning.minutesByDay)}" fill="none" stroke="${COLORS.planning}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="${f(peakX)}" cy="${f(y(vanillaPeak))}" r="4" fill="${COLORS.vanilla}"/>
  <text x="${f(labelX)}" y="${f(y(vanillaPeak) - 8)}" font-size="13" font-weight="600" fill="${COLORS.vanilla}">${esc(t.peak(vanillaPeak))}</text>
  <circle cx="${f(peakX)}" cy="${f(y(planningPeak))}" r="4" fill="${COLORS.planning}"/>
  <text x="${f(labelX)}" y="${f(y(planningPeak) + 18)}" font-size="13" font-weight="600" fill="${COLORS.planning}">${esc(t.peak(planningPeak))}</text>
  <text x="${W / 2}" y="${H - M.bottom + 28}" font-size="12" text-anchor="middle" fill="${COLORS.budget}">${esc(t.x)}</text>
  <text x="18" y="${(H - M.bottom + M.top) / 2}" font-size="12" text-anchor="middle" fill="${COLORS.budget}" transform="rotate(-90 18 ${(H - M.bottom + M.top) / 2})">${esc(t.y)}</text>
  <line x1="${M.left}" x2="${M.left + 24}" y1="${H - M.bottom + 52}" y2="${H - M.bottom + 52}" stroke="${COLORS.vanilla}" stroke-width="3"/>
  <text x="${M.left + 30}" y="${H - M.bottom + 56}" font-size="12" fill="${COLORS.text}">${esc(t.vanilla)}</text>
  <line x1="${M.left + 300}" x2="${M.left + 324}" y1="${H - M.bottom + 52}" y2="${H - M.bottom + 52}" stroke="${COLORS.planning}" stroke-width="3"/>
  <text x="${M.left + 330}" y="${H - M.bottom + 56}" font-size="12" fill="${COLORS.text}">${esc(t.planning)}</text>
${wrapped.map((l, i) => `  <text x="${M.left}" y="${H - M.bottom + 80 + i * 14}" font-size="10.5" fill="${COLORS.budget}">${esc(l)}</text>`).join("\n")}
</svg>
`;
}
