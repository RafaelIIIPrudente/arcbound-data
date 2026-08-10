import { describe, expect, it } from "vitest";

import { OUTREACH_HEADERS, parseOutreachCsv } from "./parse-outreach";

// ─────────────────────────────────────────────────────────────────────────────
// The parser is PURE — no I/O, no clock, no database. Every test here builds a
// CSV string and asserts on the returned rows.
//
// The fixtures use the EXACT 39 headers of the "Arcbound LinkedIn Master
// Database" export, in source order — the original 24, plus the 15 `Email — *`
// columns appended 2026-08-03. `header()` is built from the module's own
// constant so a header the schema expects can never drift from the header the
// fixtures send — a mismatch there would make every test below pass against a
// parser that reads columns nobody exports.
// ─────────────────────────────────────────────────────────────────────────────

const header = () => OUTREACH_HEADERS.join(",");

/** A full 39-cell row, overridable by header name. */
function row(over: Partial<Record<string, string>> = {}): string {
  const values: Record<string, string> = {
    "Full Name": "Dana Reyes",
    Title: "VP Engineering",
    Company: "Northwind",
    "ICP Seg": "Series B SaaS",
    "Why They Fit (signal)": "hiring 12 engineers",
    "What They Lack": "employer brand",
    "What Arcbound Offers (tier + hook)": "Tier 2 - founder-led content",
    "Matching Client Archetype": "Founder / CEO / investor",
    "LinkedIn URL": "https://www.linkedin.com/in/dana-reyes",
    Location: "Austin, TX",
    "Source / Citation": "TechCrunch 2026-05-02",
    "Rationale (1-line)": "scaling fast, no exec presence",
    "LinkedIn Message": "Hi Dana - noticed you are hiring",
    "Connection Status": "Pending",
    "Date Sent": "2026-07-20",
    "Reply Status": "No Reply",
    "Follow-up Count": "0",
    "Last Follow-up Date": "",
    "Next Touch Date": "",
    "Meeting Booked (date)": "",
    Stage: "Requested",
    Owner: "Bryan",
    Notes: "",
    "Qualified (ICP)": "Yes",
    "Email — Best Email": "dana@northwind.io",
    "Email — Mobile": "555-0100",
    "Email — Subject Line": "Quick question about hiring",
    "Email — Message": "Hi Dana - reaching out by email",
    "Email — Status": "Drafted",
    "Email — Date Emailed": "2026-07-21",
    "Email — Reply Status": "No reply",
    "Email — Follow-up Count": "0",
    "Email — Last Follow-up Date": "",
    "Email — Next Touch Date": "",
    "Email — Webinar Registered": "No",
    "Email — Meeting Booked (date)": "",
    "Email — Stage": "Drafted",
    "Email — Owner": "Bryan",
    "Email — Notes": "",
    ...over,
  };
  // Quote every cell so commas and newlines inside values survive.
  return OUTREACH_HEADERS.map((h) => `"${(values[h] ?? "").replace(/"/g, '""')}"`).join(",");
}

const csv = (...rows: string[]) => [header(), ...rows].join("\n");

/** Narrow the union in one place so tests read as assertions, not type guards. */
function rowsOf(result: ReturnType<typeof parseOutreachCsv>) {
  if ("error" in result) throw new Error(`expected rows, got error: ${result.error}`);
  return result.rows;
}

function errorOf(result: ReturnType<typeof parseOutreachCsv>) {
  if (!("error" in result)) throw new Error("expected an error, got rows");
  return result.error;
}

describe("OUTREACH_HEADERS", () => {
  it("is the 39 source headers, in export order, spelled exactly", () => {
    // ⚠️ THIS LIST IS A CONTRACT WITH A FILE NOBODY IN THIS REPO CONTROLS. The
    // spellings carry spaces, parentheses, a slash and a hyphen; one character
    // wrong and that column reads as blank for every row of every upload, with
    // no error anywhere — the same silent-gap failure an omitted SELECT column
    // causes. Diff this against a real export before trusting an import.
    //
    // ⚠️ THE 15 `Email — *` HEADERS USE AN EM DASH (U+2014), NOT A HYPHEN. Copied
    // verbatim from the source export — one wrong character here and that whole
    // column is missing from every row of every upload (2026-08-03).
    expect(OUTREACH_HEADERS).toEqual([
      "Full Name",
      "Title",
      "Company",
      "ICP Seg",
      "Why They Fit (signal)",
      "What They Lack",
      "What Arcbound Offers (tier + hook)",
      "Matching Client Archetype",
      "LinkedIn URL",
      "Location",
      "Source / Citation",
      "Rationale (1-line)",
      "LinkedIn Message",
      "Connection Status",
      "Date Sent",
      "Reply Status",
      "Follow-up Count",
      "Last Follow-up Date",
      "Next Touch Date",
      "Meeting Booked (date)",
      "Stage",
      "Owner",
      "Notes",
      "Qualified (ICP)",
      "Email — Best Email",
      "Email — Mobile",
      "Email — Subject Line",
      "Email — Message",
      "Email — Status",
      "Email — Date Emailed",
      "Email — Reply Status",
      "Email — Follow-up Count",
      "Email — Last Follow-up Date",
      "Email — Next Touch Date",
      "Email — Webinar Registered",
      "Email — Meeting Booked (date)",
      "Email — Stage",
      "Email — Owner",
      "Email — Notes",
    ]);
    expect(OUTREACH_HEADERS).toHaveLength(39);
  });
});

describe("parseOutreachCsv — a valid file", () => {
  it("parses a 2-row file into snake_case rows matching the SQL columns", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row(), row({ "Full Name": "Sam Okafor" }))));

    expect(rows).toHaveLength(2);
    expect(rows[0]!.full_name).toBe("Dana Reyes");
    expect(rows[1]!.full_name).toBe("Sam Okafor");
    expect(rows[0]!.linkedin_url).toBe("https://www.linkedin.com/in/dana-reyes");
  });

  it("maps every one of the 39 headers to its column key — no key is dropped", () => {
    // ⚠️ A WHITELIST, NOT A SPOT-CHECK. Asserting the exact key set is what
    // catches a column silently lost in the header→key map: a spot-check on
    // three fields would pass while `notes` or `email_notes` never reached the
    // database.
    const rows = rowsOf(parseOutreachCsv(csv(row())));

    expect(Object.keys(rows[0]!).sort()).toEqual(
      [
        "company",
        "connection_status",
        "date_sent",
        "follow_up_count",
        "full_name",
        "icp_seg",
        "last_follow_up_date",
        "linkedin_message",
        "linkedin_url",
        "location",
        "matching_client_archetype",
        "meeting_booked_date",
        "next_touch_date",
        "notes",
        "owner",
        "qualified_icp",
        "rationale",
        "reply_status",
        "source_citation",
        "stage",
        "title",
        "what_arcbound_offers",
        "what_they_lack",
        "why_they_fit",
        "email_best_email",
        "email_mobile",
        "email_subject_line",
        "email_message",
        "email_status",
        "email_date_emailed",
        "email_reply_status",
        "email_follow_up_count",
        "email_last_follow_up_date",
        "email_next_touch_date",
        "email_webinar_registered",
        "email_meeting_booked_date",
        "email_stage",
        "email_owner",
        "email_notes",
      ].sort(),
    );
  });

  it("PRESERVES SOURCE ORDER — the snapshot replays as the file was exported", () => {
    const rows = rowsOf(
      parseOutreachCsv(
        csv(
          row({ "Full Name": "First" }),
          row({ "Full Name": "Second" }),
          row({ "Full Name": "Third" }),
        ),
      ),
    );

    expect(rows.map((r) => r.full_name)).toEqual(["First", "Second", "Third"]);
  });
});

describe('parseOutreachCsv — blank optional cells are NULL, never "" and never 0', () => {
  // ⚠️ LOAD-BEARING, NOT PEDANTRY. `Next Touch Date` is filled on 2 rows of
  // 1,435 and `Meeting Booked (date)` on 8. An empty string stored instead of a
  // null would make 1,433 rows look like they carry a value the moment anything
  // downstream tests truthiness by length, and a 0 would invent a measurement.
  it("maps a blank optional cell to null", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row({ "Next Touch Date": "" }))));

    expect(rows[0]!.next_touch_date).toBeNull();
    expect(rows[0]!.next_touch_date).not.toBe("");
    expect(rows[0]!.next_touch_date).not.toBe(0);
  });

  it("maps a WHITESPACE-ONLY optional cell to null as well", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row({ Notes: "   " }))));

    expect(rows[0]!.notes).toBeNull();
  });

  it("nulls EVERY blank optional column, not just the ones a test remembered", () => {
    const blanks: Record<string, string> = {};
    for (const h of OUTREACH_HEADERS) {
      if (h !== "Full Name" && h !== "LinkedIn URL") blanks[h] = "";
    }
    const rows = rowsOf(parseOutreachCsv(csv(row(blanks))));

    const { full_name, linkedin_url, ...optional } = rows[0]!;
    expect(full_name).toBe("Dana Reyes");
    expect(linkedin_url).toBe("https://www.linkedin.com/in/dana-reyes");
    for (const [key, value] of Object.entries(optional)) {
      expect(value, `${key} should be null when its cell is blank`).toBeNull();
    }
  });

  it('keeps a LITERAL "0" in Follow-up Count as the string "0" — it is a value, not a gap', () => {
    // ⚠️ THE MIRROR IMAGE OF THE RULE ABOVE. 1,320 rows carry "0" and that is a
    // recorded fact; only an EMPTY cell is absent. Storing it as text also keeps
    // ADR 0009: interpretation belongs at read time.
    const rows = rowsOf(parseOutreachCsv(csv(row({ "Follow-up Count": "0" }))));

    expect(rows[0]!.follow_up_count).toBe("0");
    expect(rows[0]!.follow_up_count).not.toBeNull();
    expect(typeof rows[0]!.follow_up_count).toBe("string");
  });

  it("keeps Follow-up Count as TEXT for every observed value (ADR 0009 — no coercion)", () => {
    const rows = rowsOf(
      parseOutreachCsv(
        csv(
          row({ "Follow-up Count": "0" }),
          row({ "Follow-up Count": "1" }),
          row({ "Follow-up Count": "2" }),
        ),
      ),
    );

    expect(rows.map((r) => r.follow_up_count)).toEqual(["0", "1", "2"]);
  });
});

describe("parseOutreachCsv — required fields", () => {
  it("errors when a row has no Full Name", () => {
    const result = parseOutreachCsv(csv(row({ "Full Name": "" })));

    expect(errorOf(result)).toMatch(/full name/i);
  });

  it("errors when a row has no LinkedIn URL", () => {
    const result = parseOutreachCsv(csv(row({ "LinkedIn URL": "" })));

    expect(errorOf(result)).toMatch(/linkedin url/i);
  });

  it("names the ROW so a 1,435-row file can be corrected", () => {
    const result = parseOutreachCsv(csv(row(), row({ "Full Name": "" })));

    expect(errorOf(result)).toMatch(/row 2/i);
  });

  it("errors when a REQUIRED HEADER is missing from the file entirely", () => {
    // A different export shape, not a bad row — and it must say so, because
    // every row would otherwise fail with a confusing per-row message.
    const withoutUrl = OUTREACH_HEADERS.filter((h) => h !== "LinkedIn URL");
    const text = [withoutUrl.join(","), withoutUrl.map(() => '""').join(",")].join("\n");

    expect(errorOf(parseOutreachCsv(text))).toMatch(/linkedin url/i);
  });

  it("errors when an OPTIONAL header is missing — a whole column would read as blank", () => {
    // ⚠️ ALL 24 ARE REQUIRED AS HEADERS even though 22 are optional as VALUES.
    // A file missing the `Notes` column is not a file with 1,435 blank notes; it
    // is a different export, and storing it silently would put a permanent,
    // unexplained gap in that snapshot.
    const withoutNotes = OUTREACH_HEADERS.filter((h) => h !== "Notes");
    const text = [withoutNotes.join(","), withoutNotes.map(() => '""').join(",")].join("\n");

    expect(errorOf(parseOutreachCsv(text))).toMatch(/notes/i);
  });
});

describe("parseOutreachCsv — DUPLICATES SURVIVE (ADR 0012)", () => {
  // ⚠️ THE SOURCE CONTAINS GENUINE DUPLICATE PROSPECTS: 1,419 distinct LinkedIn
  // URLs across 1,435 rows, collapsing to 1,408 once normalised. Deduplicating
  // anywhere in this path would delete real rows and quietly understate every
  // count on the dashboard. The database has no unique key for the same reason.
  it("keeps BOTH rows when two share a LinkedIn URL", () => {
    const rows = rowsOf(
      parseOutreachCsv(
        csv(row({ "Full Name": "Dana Reyes" }), row({ "Full Name": "Dana Reyes (dup)" })),
      ),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]!.linkedin_url).toBe(rows[1]!.linkedin_url);
  });

  it("keeps rows that are IDENTICAL in every one of the 24 columns", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row(), row())));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(rows[1]);
  });

  it("keeps URLs that differ ONLY by case, scheme, www. or a trailing slash", () => {
    // Normalising these is what collapses 1,419 to 1,408. The parser must not.
    const variants = [
      "https://www.linkedin.com/in/dana-reyes",
      "http://linkedin.com/in/dana-reyes",
      "https://www.linkedin.com/in/Dana-Reyes/",
      "linkedin.com/in/dana-reyes",
    ];
    const rows = rowsOf(parseOutreachCsv(csv(...variants.map((u) => row({ "LinkedIn URL": u })))));

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.linkedin_url)).toEqual(variants);
  });
});

describe("parseOutreachCsv — RFC-4180 quoting", () => {
  // The real Notes and LinkedIn Message columns carry commas and newlines.
  it("survives a comma inside a quoted field", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row({ Notes: "reach out, then follow up" }))));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.notes).toBe("reach out, then follow up");
  });

  it("survives a NEWLINE inside a quoted field without splitting the row", () => {
    const rows = rowsOf(
      parseOutreachCsv(csv(row({ "LinkedIn Message": "Hi Dana,\n\nSaw you are hiring." }))),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.linkedin_message).toBe("Hi Dana,\n\nSaw you are hiring.");
  });

  it("survives an escaped double quote inside a quoted field", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row({ Notes: 'called it a "must-have"' }))));

    expect(rows[0]!.notes).toBe('called it a "must-have"');
  });

  it("stores an email address in Notes verbatim — the value is not scrubbed here", () => {
    // 94% of Notes are filled and some carry emails. That is PII, handled by the
    // aggregate-only client boundary in SQL (ADR 0012), NOT by mangling the
    // value on the way in (ADR 0009).
    const rows = rowsOf(parseOutreachCsv(csv(row({ Notes: "dana@northwind.io" }))));

    expect(rows[0]!.notes).toBe("dana@northwind.io");
  });
});

describe("parseOutreachCsv — no data", () => {
  it("errors on a header-only file", () => {
    expect(errorOf(parseOutreachCsv(header()))).toMatch(/no data rows/i);
  });

  it("errors on an empty string", () => {
    expect(errorOf(parseOutreachCsv(""))).toBeTruthy();
  });
});

describe("parseOutreachCsv — an UNKNOWN 25th column is reported, not silently eaten", () => {
  // ⚠️ THE FAILURE THIS PAYS OFF. `outreach_prospects` has a fixed shape, so a
  // column added to the source sheet has nowhere to go and used to vanish with
  // no error, no warning and no trace. Somebody adding a column, uploading, and
  // getting a cheerful success panel back is the worst kind of bug: the app is
  // confidently wrong and the person who could fix it never finds out.
  //
  // The column is still not STORED — that needs a schema change. It is reported.
  function unknownOf(result: ReturnType<typeof parseOutreachCsv>) {
    if ("error" in result) throw new Error(`expected rows, got error: ${result.error}`);
    return result.unknownHeaders;
  }

  const withExtra = (...extra: string[]) =>
    [
      [...OUTREACH_HEADERS, ...extra].join(","),
      [...OUTREACH_HEADERS, ...extra].map(() => '"x"').join(","),
    ].join("\n");

  it("still INGESTS a file carrying an extra column", () => {
    // Non-blocking: an unexpected column must never cost anyone their upload.
    const result = parseOutreachCsv(withExtra("Lead Score"));

    expect(rowsOf(result)).toHaveLength(1);
  });

  it("names the extra column verbatim", () => {
    expect(unknownOf(parseOutreachCsv(withExtra("Lead Score")))).toEqual(["Lead Score"]);
  });

  it("names EVERY extra column, in file order", () => {
    expect(unknownOf(parseOutreachCsv(withExtra("Lead Score", "Territory")))).toEqual([
      "Lead Score",
      "Territory",
    ]);
  });

  it("reports NO unknown columns for a clean 39-column file — no false alarm", () => {
    // ⚠️ A WARNING THAT FIRES ON EVERY GOOD FILE IS A WARNING NOBODY READS. The
    // ordinary export must come back with an empty list, which is what lets the
    // action show the notice only when there is genuinely something to say.
    const result = parseOutreachCsv(csv(row()));

    expect(unknownOf(result)).toEqual([]);
    expect(unknownOf(result)).toHaveLength(0);
  });

  it("does not confuse a MISSING known column with an extra one", () => {
    // A file short a required header is an error, not a warning — the two
    // failures stay on their own channels.
    const withoutNotes = OUTREACH_HEADERS.filter((h) => h !== "Notes");
    const text = [withoutNotes.join(","), withoutNotes.map(() => '""').join(",")].join("\n");

    expect(errorOf(parseOutreachCsv(text))).toMatch(/notes/i);
  });

  it("leaves the parsed ROW shape untouched — the extra column is not a field", () => {
    // The report is metadata about the file, not data smuggled into the row. A
    // 25th key here would reach `ingest_outreach`, which reads by name and would
    // silently ignore it — putting us back where we started.
    const rows = rowsOf(parseOutreachCsv(withExtra("Lead Score")));

    expect(Object.keys(rows[0]!)).toHaveLength(39);
    expect(rows[0]!).not.toHaveProperty("Lead Score");
  });

  it("still applies every existing rule when an extra column is present", () => {
    // Required-field validation, blank⇒null and duplicate survival are unchanged
    // by the presence of an unknown column.
    const header = [...OUTREACH_HEADERS, "Lead Score"].join(",");
    const cells = (over: Record<string, string>) =>
      [...OUTREACH_HEADERS, "Lead Score"]
        .map(
          (h) => `"${over[h] ?? (h === "Full Name" ? "Dana" : h === "LinkedIn URL" ? "u" : "")}"`,
        )
        .join(",");

    const result = parseOutreachCsv([header, cells({}), cells({})].join("\n"));
    const rows = rowsOf(result);

    expect(rows).toHaveLength(2); // duplicates survive
    expect(rows[0]!.notes).toBeNull(); // blank ⇒ null
    expect(rows[0]!.full_name).toBe("Dana");
  });
});

describe("parseOutreachCsv — raw storage (ADR 0009)", () => {
  it("does NOT trim, re-case, or canonicalise a value it keeps", () => {
    const rows = rowsOf(
      parseOutreachCsv(
        csv(row({ "Reply Status": "  Replied 2026-07-13  ", Stage: "MEETING BOOKED" })),
      ),
    );

    // The trailing date and the odd casing are the read layer's problem. This
    // boundary's only job is to say whether the cell was blank.
    expect(rows[0]!.reply_status).toBe("  Replied 2026-07-13  ");
    expect(rows[0]!.stage).toBe("MEETING BOOKED");
  });

  it("keeps a dirty Reply Status verbatim rather than bucketing it", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row({ "Reply Status": "Replied - Positive" }))));

    expect(rows[0]!.reply_status).toBe("Replied - Positive");
  });

  it("keeps the 2020 Date Sent outlier — surfacing it is a read-time decision", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row({ "Date Sent": "2020-12-04" }))));

    expect(rows[0]!.date_sent).toBe("2020-12-04");
  });
});

describe("parseOutreachCsv — the Email channel (15 new columns, 2026-08-03)", () => {
  // The export grew from 24 to 39 columns: 15 `Email — *` fields tracking a
  // second outreach channel alongside LinkedIn. Same rules as the original 24 —
  // required as HEADERS, optional as VALUES, blank ⇒ null, never trimmed or
  // coerced (ADR 0009) — proven here rather than assumed from the generic tests
  // above.

  it("parses a 39-column file with every new field populated on the row", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row())));

    expect(rows[0]).toMatchObject({
      email_best_email: "dana@northwind.io",
      email_mobile: "555-0100",
      email_subject_line: "Quick question about hiring",
      email_message: "Hi Dana - reaching out by email",
      email_status: "Drafted",
      email_date_emailed: "2026-07-21",
      email_reply_status: "No reply",
      email_follow_up_count: "0",
      email_webinar_registered: "No",
      email_stage: "Drafted",
      email_owner: "Bryan",
    });
  });

  it("errors when a REQUIRED Email HEADER is missing — a whole column would read as blank", () => {
    // ⚠️ ALL 39 ARE REQUIRED AS HEADERS, per D3: a file missing `Email — Notes` is
    // not a file with 1,614 blank email notes, it is a different export, and going
    // forward that includes every one of the 15 new columns too.
    const withoutEmailStatus = OUTREACH_HEADERS.filter((h) => h !== "Email — Status");
    const text = [withoutEmailStatus.join(","), withoutEmailStatus.map(() => '""').join(",")].join(
      "\n",
    );

    expect(errorOf(parseOutreachCsv(text))).toMatch(/email — status/i);
  });

  it("errors naming the missing column for EACH of the 15 new headers, not just one", () => {
    for (const missing of [
      "Email — Best Email",
      "Email — Mobile",
      "Email — Subject Line",
      "Email — Message",
      "Email — Date Emailed",
      "Email — Reply Status",
      "Email — Follow-up Count",
      "Email — Last Follow-up Date",
      "Email — Next Touch Date",
      "Email — Webinar Registered",
      "Email — Meeting Booked (date)",
      "Email — Stage",
      "Email — Owner",
      "Email — Notes",
    ]) {
      const withoutIt = OUTREACH_HEADERS.filter((h) => h !== missing);
      const text = [withoutIt.join(","), withoutIt.map(() => '""').join(",")].join("\n");

      expect(errorOf(parseOutreachCsv(text)), `missing header: ${missing}`).toContain(missing);
    }
  });

  it("maps a blank new (Email) cell to null — never '' and never 0", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row({ "Email — Best Email": "" }))));

    expect(rows[0]!.email_best_email).toBeNull();
    expect(rows[0]!.email_best_email).not.toBe("");
    expect(rows[0]!.email_best_email).not.toBe(0);
  });

  it("keeps a literal '0' in Email — Follow-up Count as the string '0' — a value, not a gap", () => {
    const rows = rowsOf(parseOutreachCsv(csv(row({ "Email — Follow-up Count": "0" }))));

    expect(rows[0]!.email_follow_up_count).toBe("0");
    expect(typeof rows[0]!.email_follow_up_count).toBe("string");
  });

  it("⚠️ unknownHeaders is EMPTY for a valid 39-column file — the behaviour this slice exists to fix", () => {
    // Before this slice, every one of these 15 columns landed in unknownHeaders
    // and was silently dropped. A clean 39-column export must no longer warn.
    const result = parseOutreachCsv(csv(row()));

    if ("error" in result) throw new Error(`expected rows, got error: ${result.error}`);
    expect(result.unknownHeaders).toEqual([]);
  });

  it("still reports a 40th unexpected column in unknownHeaders, non-blockingly", () => {
    const withExtra = [
      [...OUTREACH_HEADERS, "Lead Score"].join(","),
      [...OUTREACH_HEADERS, "Lead Score"].map(() => '"x"').join(","),
    ].join("\n");

    const result = parseOutreachCsv(withExtra);

    if ("error" in result) throw new Error(`expected rows, got error: ${result.error}`);
    expect(result.unknownHeaders).toEqual(["Lead Score"]);
    expect(result.rows).toHaveLength(1);
  });
});
