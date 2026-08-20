import { describe, expect, it } from "vitest";

import type { AuthorVerdict } from "./author-match";
import {
  authorMatchReport,
  classifyAuthor,
  cleanAuthorName,
  decoratedAuthorNote,
  nameMatchWarning,
} from "./author-match";

/** The production string, verbatim (2026-08-18): duplicated name + Premium badge. */
const EITAN = "Eitan Hoenig Eitan Hoenig • You Premium • You";
/** The production string, verbatim (2026-08-20): duplicated name + Verified badge. */
const RAJ = "Raj Singh Raj Singh • You Verified • You";

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

// ── THE SHARED PREDICATE ─────────────────────────────────────────────────────
// Every case in the corpus, and every trap the construction has to survive. Both
// `nameMatchWarning` and `authorMatchReport` derive from `classifyAuthor`, so
// this table is the single description of what the guard believes.

/** client · scraped · residue · verdict — the whole acceptance table. */
const TABLE: { client: string; scraped: string; residue: string; verdict: AuthorVerdict }[] = [
  // The two production artifacts. Same shape, different badge.
  { client: "Raj Singh", scraped: RAJ, residue: "", verdict: "artifact" },
  { client: "Eitan Hoenig", scraped: EITAN, residue: "", verdict: "artifact" },
  // ⚠️ THE NAME IS A PREFIX OF A BADGE WORD. "Prem" and "Veri" are real given
  // names, and a sequential "strip the name, then strip chrome" fragments the
  // badge — "Premium" loses its "Prem" and `Premium` can no longer match what is
  // left, so the row gated forever on a residue ("ium") that names no badge and
  // points a reader at nothing.
  { client: "Prem", scraped: "Prem • You Premium • You", residue: "", verdict: "artifact" },
  { client: "Veri", scraped: "Veri • You Verified • You", residue: "", verdict: "artifact" },
  // ⚠️ AND THE SAME COLLISION FROM THE OTHER SIDE, which is why the naive fix —
  // stripping chrome FIRST — is also wrong. A Client legitimately named
  // "Premium Care" would have `Premium` eaten out of their own name and would
  // then never match anything. Neither order alone is correct; see the scanner.
  {
    client: "Premium Care",
    scraped: "Premium Care Premium Care • You Premium • You",
    residue: "",
    verdict: "artifact",
  },
  // The ordinary upload, unchanged since ADR 0009.
  { client: "Bryan Wish", scraped: "Bryan Wish • You", residue: "", verdict: "match" },
  { client: "Bryan Wish", scraped: "Bryan Wish", residue: "", verdict: "match" },
  // A different person entirely.
  {
    client: "Raj Singh",
    scraped: "Charlene Li • You",
    residue: "Charlene Li",
    verdict: "mismatch",
  },
  // ⚠️ TRAP 1 — THE SUBSTRING TRAP, and the most important row in this file.
  // `scraped.includes(clientName)` is TRUE here. It is the exact defect shape
  // that paints "Not Interested" green in the Outreach viewer. Requiring the
  // residue to be EMPTY is what keeps this a mismatch.
  { client: "Raj Singh", scraped: "Raj Singhania", residue: "ania", verdict: "mismatch" },
  // ⚠️ TRAP 3 — an unmapped badge is DISCLOSED, never swallowed. Only `Premium`
  // and `Verified` are evidenced by the corpus, so anything else must fail safe
  // and put the token it could not account for on the screen.
  {
    client: "Raj Singh",
    scraped: "Raj Singh Raj Singh • You Influencer • You",
    residue: "Influencer",
    verdict: "mismatch",
  },
  // ⚠️ TRAP 2 — THE EMPTY-STRING TRAP. Stripping nothing from nothing leaves
  // nothing, so a bare residue check would read this as a match. A row with no
  // author is not evidence that the author is this Client.
  { client: "Raj Singh", scraped: "", residue: "", verdict: "mismatch" },
  { client: "Raj Singh", scraped: "   ", residue: "", verdict: "mismatch" },
  // ⚠️ THE SAME HOLE FROM THE OTHER SIDE, and the reason the client's name must
  // actually BE present. This is pure chrome — it strips to an empty residue
  // while containing no name at all.
  { client: "Raj Singh", scraped: "• You Premium • You", residue: "", verdict: "mismatch" },
  // Case-sensitivity of the NAME is unchanged; only chrome matches loosely.
  { client: "Bryan Wish", scraped: "bryan wish", residue: "bryan wish", verdict: "mismatch" },
];

describe("classifyAuthor — the client's name is the trusted side, never the scrape", () => {
  it.each(TABLE)(
    "$client ← $scraped → $verdict (residue $residue)",
    ({ client, scraped, residue, verdict }) => {
      expect(classifyAuthor(scraped, client)).toEqual({ verdict, residue });
    },
  );

  it("⚠️ two rows strip to an EMPTY residue and are NOT the same state", () => {
    // The discriminator for the containment requirement. Both of these leave
    // nothing behind; only one of them contains the Client's name.
    expect(classifyAuthor(RAJ, "Raj Singh").verdict).toBe("artifact");
    expect(classifyAuthor("• You Premium • You", "Raj Singh").verdict).toBe("mismatch");
  });

  it("⚠️ never rewrites the scraped value — the residue is a MEASUREMENT, not a name", () => {
    // ADR 0009 still binds. Nothing here produces a corrected author string; the
    // residue is what could not be accounted for, which is evidence, not data.
    expect(classifyAuthor(RAJ, "Raj Singh").residue).not.toBe("Raj Singh");
  });
});

describe("nameMatchWarning", () => {
  it("returns null when every scraped author matches the client name", () => {
    expect(
      nameMatchWarning(authorMatchReport([{ post_name: "Bryan Wish • You" }], "Bryan Wish")),
    ).toBeNull();
  });

  it("⚠️ returns null for a decorated author block — it is not a disagreement", () => {
    // The gate no longer fires for these, so the post-write sentence must not
    // claim a disagreement either. The NOTE is what records them.
    expect(nameMatchWarning(authorMatchReport([{ post_name: RAJ }], "Raj Singh"))).toBeNull();
    expect(nameMatchWarning(authorMatchReport([{ post_name: EITAN }], "Eitan Hoenig"))).toBeNull();
  });

  it("warns with counts when some authors don't match (exact, case-sensitive)", () => {
    const rows = [
      { post_name: "Bryan Wish • You" }, // match
      { post_name: "Someone Else" }, // no match
      { post_name: "bryan wish" }, // case differs → no match
    ];
    const warning = nameMatchWarning(authorMatchReport(rows, "Bryan Wish"));
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

  it("⚠️ AGREES WITH authorMatchReport ON EVERY CASE IN THE TABLE", () => {
    // ⚠️ THE "VIEW TESTED, WIRING NOT" DEFECT SHAPE. These two feed different
    // screens — the confirm gate reads the report, the post-write summary reads
    // the sentence. If they ever disagreed, one screen would say "fine" while
    // the other said "60 posts don't match". Pinned directly rather than hoped.
    for (const { client, scraped, verdict } of TABLE) {
      const rows = [{ post_name: scraped }];
      const report = authorMatchReport(rows, client);
      const warning = nameMatchWarning(report);

      expect(report.authors[0]!.verdict).toBe(verdict);
      expect(warning === null).toBe(report.mismatched === 0);
    }
  });
});

describe("authorMatchReport — structured evidence, not a sentence", () => {
  it("reports NO mismatch when every scraped author matches", () => {
    const report = authorMatchReport(
      [{ post_name: "Bryan Wish • You" }, { post_name: "Bryan Wish • You" }],
      "Bryan Wish",
    );

    expect(report.mismatched).toBe(0);
    expect(report.total).toBe(2);
    expect(report.decorated).toBe(0);
    expect(report.authors.every((a) => a.verdict === "match")).toBe(true);
  });

  it("⚠️ a plain trailing ' • You' still matches — the ordinary upload must not prompt", () => {
    // The clean case covers nearly every upload and has to stay silent. If this
    // regresses, staff get a confirmation dialog on every single upload and will
    // click through it blind, which is how the gate becomes useless.
    const report = authorMatchReport([{ post_name: "Bryan Wish • You" }], "Bryan Wish");

    expect(report.mismatched).toBe(0);
    // ⚠️ AND NO NOTE EITHER. A plain " • You" is not a decorated author block;
    // counting it would put a notice on every upload Bryan has ever done.
    expect(report.decorated).toBe(0);
  });

  it("⚠️ RE-TARGETED: the real Eitan Hoenig string is an ARTIFACT, not a mismatch", () => {
    // ⚠️ RE-TARGETED, NOT WEAKENED. This asserted `mismatched === 1` — correct
    // while attribution was a name match (ADR 0009), because a wrong guess sent
    // posts to the wrong Client. Under ADR 0010 attribution is the `client_id`
    // FK from the operator's dropdown, so accounting for LinkedIn's author-block
    // chrome cannot misattribute anything; it only decides whether a notice
    // appears. What the old assertion protected — that a MANGLED string is never
    // silently accepted as a name — now lives in the `Raj Singhania` and
    // `Influencer` rows of TABLE above.
    const report = authorMatchReport([{ post_name: EITAN }], "Eitan Hoenig");

    expect(report.mismatched).toBe(0);
    expect(report.decorated).toBe(1);
    expect(report.authors[0]!.verdict).toBe("artifact");
  });

  it("⚠️ the Verified badge behaves exactly like the Premium one", () => {
    // Rows 2 and 3 of the corpus are structurally identical. This is not an
    // Eitan fix or a Raj fix — it is every Premium and every Verified account.
    const report = authorMatchReport([{ post_name: RAJ }], "Raj Singh");

    expect(report.mismatched).toBe(0);
    expect(report.decorated).toBe(1);
    expect(report.authors[0]!.verdict).toBe("artifact");
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
    // ⚠️ RE-TARGETED: `mismatched` was 14. The COUNT-BY-DISTINCT-STRING
    // behaviour this test exists for is untouched; only the verdict moved.
    expect(report.mismatched).toBe(0);
    expect(report.decorated).toBe(14);
  });

  it("shows what could not be accounted for, not just the raw string", () => {
    // ⚠️ RE-TARGETED FROM `cleaned`. The raw string alone doesn't explain a
    // refusal, and `cleaned` no longer describes the comparison — the predicate
    // strips the CLIENT'S name plus known chrome and looks at what is left. The
    // residue is that leftover, and it is what the screen has to show.
    const report = authorMatchReport([{ post_name: "Raj Singhania" }], "Raj Singh");

    expect(report.authors[0]!.residue).toBe("ania");
    expect(report.clientName).toBe("Raj Singh");
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
    // ⚠️ RE-TARGETED: was 3. EITAN leaves the mismatch count — only the genuinely
    // different author remains. The ORDERING guarantee this test exists for is
    // unchanged and asserted below, with the artifact ranked between them.
    expect(report.mismatched).toBe(1);
    expect(report.decorated).toBe(2);
    // Genuine mismatches first, then artifacts, then matches — by how much
    // attention each deserves. Commonest first inside a rank.
    expect(report.authors.map((a) => a.postName)).toEqual([
      "Someone Else",
      EITAN,
      "Eitan Hoenig • You",
    ]);
  });

  it("keeps a missing post_name visible rather than dropping the row", () => {
    // A row with no author is still a row someone has to account for. Dropping
    // it would make the counts disagree with the upload.
    const report = authorMatchReport([{}, { post_name: "Eitan Hoenig • You" }], "Eitan Hoenig");

    expect(report.total).toBe(2);
    expect(report.mismatched).toBe(1);
    expect(report.authors[0]!.postName).toBe("");
  });

  it("⚠️ NEVER rewrites the scraped value", () => {
    // ADR 0009 forbids reinterpreting scraped data, and the raw string is the
    // whole diagnostic value: it is what shows a reader that the scraper
    // duplicated the name and swept in a badge.
    //
    // ⚠️ RE-TARGETED: `mismatched` was 1. The RAW-PRESERVATION half is the point
    // of this test and is untouched — accounting for chrome when DECIDING must
    // never become rewriting the value that is STORED.
    const report = authorMatchReport([{ post_name: EITAN }], "Eitan Hoenig");

    expect(report.authors[0]!.postName).toBe(EITAN);
    expect(report.mismatched).toBe(0);
  });
});

describe("decoratedAuthorNote — the non-blocking record", () => {
  it("returns null when nothing was decorated", () => {
    expect(decoratedAuthorNote(authorMatchReport([{ post_name: "Raj Singh" }], "Raj Singh"))).toBe(
      null,
    );
  });

  it("⚠️ states the count, the RAW string, where the posts went, and whose fault it is", () => {
    // ⚠️ THE WORDS, NOT A LOOSE SUBSTRING — see the lesson at the top of this
    // file. A `toContain("scraper")` would be satisfied by a sentence telling
    // the reader to go and align the names, which under ADR 0010 changes
    // nothing and is exactly the false instruction a previous version shipped.
    const rows = Array.from({ length: 60 }, () => ({ post_name: RAJ }));
    const note = decoratedAuthorNote(authorMatchReport(rows, "Raj Singh"))!;

    expect(note).toContain("60 posts");
    expect(note).toContain(RAJ);
    expect(note).toContain("filed");
    expect(note).toContain("Raj Singh");
    // ⚠️ RE-TARGETED, AND THE OLD WORDS WERE THE DEFECT. This asserted
    // "whole author block" — the note's old opening, which overclaimed for the
    // same reason its closing did: an artifact is the Client's name plus known
    // chrome in ANY arrangement, so "Raj Singh Premium" is one and is nothing
    // like a whole block. The claim now names what was actually carried.
    expect(note).toContain("carried more than Raj Singh's name");
    expect(note).toContain("come from the scraper, not from ArcBase");
  });

  it("⚠️ does NOT read as a failure, and does NOT ask anyone to align names", () => {
    const note = decoratedAuthorNote(authorMatchReport([{ post_name: RAJ }], "Raj Singh"))!;

    expect(note).not.toMatch(/align|rename|wrong|error|failed|problem|couldn't|could not/i);
    expect(note).toContain("1 post");
  });

  it("⚠️ a BADGE with no repetition does not claim a repeated name", () => {
    // ⚠️ THE NOTE USED TO ASSERT A FIXED SHAPE. It ended, unconditionally, "The
    // repeated name and the badge come from the scraper" — false here, where the
    // name appears once. This is staff-facing copy on the ONLY screen that
    // records the fact at all, so a confident false sentence is a defect.
    const note = decoratedAuthorNote(
      authorMatchReport([{ post_name: "Raj Singh Premium" }], "Raj Singh"),
    )!;

    expect(note).toContain("Raj Singh Premium");
    expect(note).toContain("The badge comes from the scraper, not from ArcBase.");
    expect(note).not.toMatch(/repeated/i);
  });

  it("⚠️ a REPETITION with no badge does not claim a badge", () => {
    const note = decoratedAuthorNote(
      authorMatchReport([{ post_name: "Raj Singh Raj Singh" }], "Raj Singh"),
    )!;

    expect(note).toContain("Raj Singh Raj Singh");
    expect(note).toContain("The repeated name comes from the scraper, not from ArcBase.");
    expect(note).not.toMatch(/badge/i);
  });

  it("⚠️ both together still says both", () => {
    // The discriminator: a note that had simply dropped the claim would satisfy
    // the two negatives above while saying nothing at all.
    const note = decoratedAuthorNote(authorMatchReport([{ post_name: RAJ }], "Raj Singh"))!;

    expect(note).toContain(
      "The repeated name and the badge come from the scraper, not from ArcBase.",
    );
  });

  it("⚠️ does not claim a 'whole author block' when only part of one arrived", () => {
    // The opening overclaimed for the same reason the closing did.
    const note = decoratedAuthorNote(
      authorMatchReport([{ post_name: "Raj Singh Premium" }], "Raj Singh"),
    )!;

    expect(note).not.toMatch(/whole author block/i);
  });

  it("names every distinct decorated string, not just the first", () => {
    const rows = [{ post_name: RAJ }, { post_name: "Raj Singh Raj Singh • You Premium • You" }];
    const note = decoratedAuthorNote(authorMatchReport(rows, "Raj Singh"))!;

    expect(note).toContain(RAJ);
    expect(note).toContain("Raj Singh Raj Singh • You Premium • You");
    expect(note).toContain("2 posts");
  });
});
