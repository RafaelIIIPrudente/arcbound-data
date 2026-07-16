import { describe, expect, it } from "vitest";

import { cleanAuthorName, nameMatchWarning } from "./author-match";

describe("cleanAuthorName", () => {
  it("strips a trailing ' • You' (case-insensitive) and trims", () => {
    expect(cleanAuthorName("Bryan Wish • You")).toBe("Bryan Wish");
    expect(cleanAuthorName("Bryan Wish • you")).toBe("Bryan Wish");
    expect(cleanAuthorName("  Priya Nadella • You  ")).toBe("Priya Nadella");
  });

  it("leaves a plain name unchanged and handles empty/undefined", () => {
    expect(cleanAuthorName("Bryan Wish")).toBe("Bryan Wish");
    expect(cleanAuthorName("")).toBe("");
    expect(cleanAuthorName(undefined)).toBe("");
  });
});

describe("nameMatchWarning", () => {
  it("returns null when every cleaned author matches the client name", () => {
    expect(nameMatchWarning([{ post_name: "Bryan Wish • You" }], "Bryan Wish")).toBeNull();
  });

  it("warns with counts when some authors don't match (exact, case-sensitive)", () => {
    const rows = [
      { post_name: "Bryan Wish • You" }, // → "Bryan Wish" (match)
      { post_name: "Someone Else" }, // no match
      { post_name: "bryan wish" }, // case differs → no match
    ];
    const warning = nameMatchWarning(rows, "Bryan Wish");
    expect(warning).toContain("2 of 3");
    expect(warning).toContain("Bryan Wish");
    expect(warning).toContain("analytics");
  });
});
