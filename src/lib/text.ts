// Levenshtein distance — used to compute editDistance on approved drafts
// (how much the operator changed the suggestion; the core quality KPI).

export function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, curr[0]] = [curr.slice(), 0];
  }
  return prev[b.length];
}

export function editPct(generated: string, final: string): number {
  const denom = Math.max(generated.length, final.length);
  if (denom === 0) return 0;
  return Math.round((100 * levenshtein(generated, final)) / denom);
}
