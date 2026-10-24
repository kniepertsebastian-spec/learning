/** Bei falsch beantworteten Szenario- und Fehlersuche-Fragen bieten wir die freiwillige Selbsterklärung an (roadmap_didaktik 3.3). */
const SELF_EXPLAIN_TYPES = new Set(["scenario", "troubleshooting"]);

export function isSelfExplainType(type: string | null | undefined): boolean {
  return Boolean(type) && SELF_EXPLAIN_TYPES.has(type as string);
}
