/**
 * Setzt Werte in einen übersetzten Text: `{0}`, `{1}` … werden durch die Argumente ersetzt, genau wie `${…}` in einem
 * Template-Literal (String(wert)). Für Texte aus lib/i18n/components mit eingebetteten Werten.
 */
export function fill(template: string, ...values: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (match, i: string) => (Number(i) < values.length ? String(values[Number(i)]) : match));
}
