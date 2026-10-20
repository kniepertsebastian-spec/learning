/**
 * Zeilenweiser Vergleich zweier Texte (LCS), für die Versionsansicht der Kurs-Werkstatt. Bei sehr langen Texten
 * (mehr als ~4 Mio. Zellen) kein feiner Vergleich: dann alles Alte raus, alles Neue rein.
 */
export type DiffLine = { type: "same" | "add" | "del"; text: string };

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // Gemeinsamen Anfang und gemeinsames Ende abschneiden: die üblichen kleinen Änderungen kosten dann fast nichts.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head = a.slice(0, start).map((text) => ({ type: "same" as const, text }));
  const tail = a.slice(endA).map((text) => ({ type: "same" as const, text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m > 4_000_000) return [...head, ...midA.map((text) => ({ type: "del" as const, text })), ...midB.map((text) => ({ type: "add" as const, text })), ...tail];

  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const mid: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      mid.push({ type: "same", text: midA[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) mid.push({ type: "del", text: midA[i++] });
    else mid.push({ type: "add", text: midB[j++] });
  }
  while (i < n) mid.push({ type: "del", text: midA[i++] });
  while (j < m) mid.push({ type: "add", text: midB[j++] });
  return [...head, ...mid, ...tail];
}

/** Gleiche Zeilen weit weg von Änderungen zu „… n unveränderte Zeilen“ zusammenfassen. */
export function collapseSame(lines: DiffLine[], context = 2): Array<DiffLine | { type: "skip"; count: number }> {
  const near = new Set<number>();
  lines.forEach((l, idx) => {
    if (l.type !== "same") for (let k = idx - context; k <= idx + context; k++) near.add(k);
  });
  const out: Array<DiffLine | { type: "skip"; count: number }> = [];
  for (let idx = 0; idx < lines.length; idx++) {
    if (lines[idx].type !== "same" || near.has(idx)) {
      out.push(lines[idx]);
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.type === "skip") last.count++;
    else out.push({ type: "skip", count: 1 });
  }
  return out;
}
