import { describe, expect, it } from "vitest";

import { median } from "./median";

// Characterisation of the ONE median, lifted verbatim from the two byte-identical
// copies it replaced (analytics.ts, data-quality.ts). These four behaviours are
// the contract both call sites relied on; they must not shift in the move.
describe("median", () => {
  it("is null for an empty array — there is no middle of nothing", () => {
    expect(median([])).toBeNull();
  });

  it("returns the middle value for an odd-length array", () => {
    // Unsorted input: the function sorts internally, so 3 is the middle of 1..5.
    expect(median([5, 1, 3, 2, 4])).toBe(3);
  });

  it("returns the MEAN of the middle two for an even-length array", () => {
    // Sorted: [1,2,3,4] → mean(2,3) = 2.5. The branch that a naive "just take the
    // middle index" implementation gets wrong.
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("never mutates its input — it sorts a COPY", () => {
    const input = [3, 1, 2];
    median(input);
    // A caller that passes a live array (a column of figures) must get it back in
    // the order it handed over.
    expect(input).toEqual([3, 1, 2]);
  });
});
