/**
 * The middle value, or the mean of the middle two. Sorts a COPY.
 *
 * ⚠️ THE INPUT IS NEVER MUTATED. Callers pass live columns of figures; sorting in
 * place would reorder a caller's array as a side effect. `null` for an empty
 * array — there is no middle of nothing, and a 0 would invent a measurement.
 *
 * The single definition, shared by the analytics comparison and the data-quality
 * rate reconciliation, which each held a byte-identical private copy before.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
