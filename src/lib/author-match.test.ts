import { describe, expect, it } from "vitest";

import { authorMatchReport, cleanAuthorName, nameMatchWarning } from "./author-match";

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
    // ⚠️ THE WORDS, NOT A LOOSE SUBSTRING. This line used to read
    // `toContain("analytics")`, which the FALSE sentence ("…won't appear in
    // analytics until the names align") satisfied exactly as well as a true one.
    // Under ADR 0010 the posts are attributed by the operator's selection, so
    // they are filed regardless and the warning is about MISATTRIBUTION.
    expect(warning).toContain("filed under that client anyway");
    expect(warning).not.toMatch(/won't appear|until the names align/i);
  });
});

describe("authorMatchReport — structured evidence, not a sentence", () => {
  // ⚠️ THE STRING BELOW IS VERBATIM FROM PRODUCTION (2026-08-18). The scraper
  // captured LinkedIn's whole author block for a Premium account: the name is
  // DUPLICATED and a `Premium` badge is swept in. All 14 posts were stranded.
  const EITAN = "Eitan Hoenig Eitan Hoenig • You Premium • You";

  it("reports NO mismatch when every cleaned author matches", () => {
    const report = authorMatchReport(
      [{ post_name: "Bryan Wish • You" }, { post_name: "Bryan Wish • You" }],
      "Bryan Wish",
    );

    expect(report.mismatched).toBe(0);
    expect(report.total).toBe(2);
    expect(report.authors.every((a) => a.matches)).toBe(true);
  });

  it("⚠️ a plain trailing ' • You' still matches — the ordinary upload must not prompt", () => {
    // The BI join strips exactly one trailing " • You", so the clean case that
    // covers nearly every upload has to stay silent. If this regresses, staff
    // get a confirmation dialog on every single upload and will click through it.
    const report = authorMatchReport([{ post_name: "Bryan Wish • You" }], "Bryan Wish");

    expect(report.mismatched).toBe(0);
  });

  it("⚠️ the real Eitan Hoenig string is a MISMATCH against a clean client name", () => {
    const report = authorMatchReport([{ post_name: EITAN }], "Eitan Hoenig");

    expect(report.mismatched).toBe(1);
    expect(report.authors[0]!.matches).toBe(false);
  });

  it("carries the DISTINCT scraped names with per-name counts — the diagnosis", () => {
    // ⚠️ "14 of 14 won't match" is a verdict. The scraped string beside the
    // client's name is a diagnosis: someone can SEE the duplicated name and the
    // stray badge and take it to whoever owns the scraper.
    const rows = Array.from({ length: 14 }, () => ({ post_name: EITAN }));
    const report = authorMatchReport(rows, "Eitan Hoenig");

    expect(report.authors).toHaveLength(1);
    expect(report.authors[0]!.postName).toBe(EITAN);
    expect(report.authors[0]!.count).toBe(14);
    expect(report.total).toBe(14);
    expect(report.mismatched).toBe(14);
  });

  it("shows what the JOIN actually compares, not just the raw string", () => {
    // The raw string alone doesn't explain the failure — the trailing " • You"
    // IS stripped, and the reader needs to see that it was and still didn't help.
    const report = authorMatchReport([{ post_name: EITAN }], "Eitan Hoenig");

    expect(report.authors[0]!.cleaned).toBe("Eitan Hoenig Eitan Hoenig • You Premium");
    expect(report.clientName).toBe("Eitan Hoenig");
  });

  it("splits a mixed upload and lists the mismatching authors FIRST", () => {
    const rows = [
      { post_name: "Eitan Hoenig • You" },
      { post_name: EITAN },
      { post_name: EITAN },
      { post_name: "Someone Else" },
    ];
    const report = authorMatchReport(rows, "Eitan Hoenig");

    expect(report.total).toBe(4);
    expect(report.mismatched).toBe(3);
    // Mismatches first, commonest first — the biggest problem is at the top.
    expect(report.authors.map((a) => a.postName)).toEqual([
      EITAN,
      "Someone Else",
      "Eitan Hoenig • You",
    ]);
  });

  it("keeps a missing post_name visible rather than dropping the row", () => {
    // A row with no author is still a row that won't be attributed. Dropping it
    // would make the counts disagree with the upload.
    const report = authorMatchReport([{}, { post_name: "Eitan Hoenig • You" }], "Eitan Hoenig");

    expect(report.total).toBe(2);
    expect(report.mismatched).toBe(1);
    expect(report.authors[0]!.postName).toBe("");
  });

  it("⚠️ NEVER rewrites the scraped value to force a match", () => {
    // ADR 0009 forbids reinterpreting scraped data, and guessing which half of a
    // mangled string is the real name is how a post lands on the wrong client.
    const report = authorMatchReport([{ post_name: EITAN }], "Eitan Hoenig");

    expect(report.authors[0]!.postName).toBe(EITAN);
    expect(report.mismatched).toBe(1);
  });
});
