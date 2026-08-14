import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_UPLOAD_TEXT_BYTES,
  SERVER_ACTION_BODY_LIMIT_BYTES,
  checkUploadSize,
  utf8Bytes,
} from "./upload-size";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS GUARD EXISTS BECAUSE THE FAILURE IT CATCHES IS INVISIBLE.
//
// Past the Server Action body limit the request is rejected in transport, before
// any action code runs — no validation message, no parse error, nothing the form
// could render. The user picks a file, presses the button, and the app does not
// respond. There is no server-side fix: by the time our code could run, the
// request is already gone. The browser is the only place this can be caught.
//
// ⚠️ NOTHING HERE PROVES THE THRESHOLD IS CORRECTLY PLACED. No test sends a real
// request, so the margin below is reasoned, not measured. See the module.
// ─────────────────────────────────────────────────────────────────────────────

/** A string of exactly `n` ASCII bytes. */
const ascii = (n: number) => "a".repeat(n);

describe("utf8Bytes — real bytes, never string length", () => {
  it("counts ASCII one byte per character", () => {
    expect(utf8Bytes("hello")).toBe(5);
  });

  it("⚠️ counts a MULTI-BYTE character as more than one byte", () => {
    // ⚠️ THE TEST THAT STOPS SOMEONE "SIMPLIFYING" THIS TO `.length`. A JS string
    // length is a UTF-16 code-unit count: "é" is 1 unit but 2 UTF-8 bytes, "→" is
    // 1 unit but 3 bytes. This file is full of human names and company names, so
    // an undercount is the ordinary case rather than an edge case — and it
    // undercounts in the direction that lets an over-limit file through.
    expect("é".length).toBe(1);
    expect(utf8Bytes("é")).toBe(2);

    expect("→".length).toBe(1);
    expect(utf8Bytes("→")).toBe(3);

    // An emoji is a surrogate PAIR: 2 code units, 4 bytes. `.length` is wrong in
    // both directions of magnitude, which is why neither can substitute.
    expect("😀".length).toBe(2);
    expect(utf8Bytes("😀")).toBe(4);
  });

  it("counts an accented CSV row the way the wire will", () => {
    // A realistic line: two accented names in a row of otherwise-ASCII fields.
    const row = "José Peña,Führung GmbH,München\n";
    expect(utf8Bytes(row)).toBe(row.length + 4);
  });
});

describe("the threshold sits BELOW the transport limit, with headroom", () => {
  it("is strictly under Next's configured body limit", () => {
    // ⚠️ THE WHOLE BODY IS LIMITED, NOT `rawText`. The other fields, the action
    // id and the multipart framing all ride along, so a threshold equal to the
    // limit would still fail in transport.
    expect(MAX_UPLOAD_TEXT_BYTES).toBeLessThan(SERVER_ACTION_BODY_LIMIT_BYTES);
  });

  it("pins the limit to the 1024-based value Next actually parses", () => {
    // Next parses "4mb" with the `bytes` package, where mb is 1024² — NOT 10⁶.
    // A reader assuming 4,000,000 would compute headroom that does not exist.
    expect(SERVER_ACTION_BODY_LIMIT_BYTES).toBe(4_194_304);
  });

  it("still clears the real Outreach export measured on 2026-07-27", () => {
    // ⚠️ THE REGRESSION THIS GUARD MUST NOT CAUSE. 1,493,914 bytes at 1,435
    // prospects is the file staff upload today; a threshold that refused it
    // would break a working feature in the name of protecting it.
    expect(1_493_914).toBeLessThan(MAX_UPLOAD_TEXT_BYTES);
  });
});

describe("checkUploadSize", () => {
  it("passes a payload comfortably under the threshold", () => {
    expect(checkUploadSize(ascii(1_000_000), "outreach").status).toBe("ok");
  });

  it("passes a payload exactly ON the threshold", () => {
    // The boundary is inclusive: the threshold is what fits, not what fails.
    expect(checkUploadSize(ascii(MAX_UPLOAD_TEXT_BYTES), "metrics").status).toBe("ok");
  });

  it("refuses a payload one byte over", () => {
    expect(checkUploadSize(ascii(MAX_UPLOAD_TEXT_BYTES + 1), "metrics").status).toBe("too-large");
  });

  it("⚠️ does NOT refuse empty input as over-limit", () => {
    // ⚠️ THAT IS THE EXISTING "add the CSV" VALIDATION'S JOB. Stealing it would
    // tell someone who selected no file that their file was too big — a nonsense
    // sentence, and one that hides the real problem.
    expect(checkUploadSize("", "outreach").status).toBe("ok");
  });

  it("reports the size it measured, in bytes", () => {
    const result = checkUploadSize(ascii(MAX_UPLOAD_TEXT_BYTES + 500), "outreach");
    expect(result.status === "too-large" && result.bytes).toBe(MAX_UPLOAD_TEXT_BYTES + 500);
  });
});

describe("the message — what the person actually reads", () => {
  const outreach = checkUploadSize(ascii(MAX_UPLOAD_TEXT_BYTES + 1), "outreach");
  const metrics = checkUploadSize(ascii(MAX_UPLOAD_TEXT_BYTES + 1), "metrics");
  const message = (r: typeof outreach) => (r.status === "too-large" ? r.message : "");

  it("states BOTH numbers — the file's size and the limit", () => {
    // "Too large" alone cannot tell someone whether they are over by a row or by
    // a factor of three, and therefore cannot tell them what to do next.
    //
    // ⚠️ IT QUOTES THE USABLE LIMIT (3.5 MB), NOT NEXT'S 4 MB. The 4 MB figure
    // would be a lie by omission: a 3.8 MB file is also refused, so telling
    // someone the ceiling is 4 MB would send them to trim to a size that still
    // will not send.
    for (const r of [outreach, metrics]) {
      expect(message(r)).toMatch(/one upload can carry about 3\.5 MB/);
    }
  });

  it("⚠️ keeps the two numbers DISTINCT at the boundary", () => {
    // ⚠️ ONE BYTE OVER, ROUNDED THE SAME WAY, READS "This file is 3.5 MB, and
    // one upload can carry about 3.5 MB" — a refusal that looks like a bug in
    // ArcBase rather than a fact about the file. The file rounds UP and the
    // limit rounds DOWN so the sentence stays coherent at its worst moment.
    expect(message(outreach)).toMatch(/This file is 3\.6 MB/);
  });

  it("scales the reported size to the real file, not just the boundary", () => {
    const big = checkUploadSize(ascii(6_000_000), "metrics");
    expect(big.status === "too-large" && big.message).toMatch(/This file is 5\.8 MB/);
  });

  it("says NOTHING WAS SENT — the upload did not half-happen", () => {
    for (const r of [outreach, metrics]) {
      expect(message(r)).toMatch(/nothing was sent|not sent/i);
    }
  });

  it("⚠️ says re-uploading the SAME file will not help", () => {
    // ⚠️ MATCHING THE REGISTER OF `unknownColumnWarning`, which says plainly that
    // the data was not stored and that re-uploading will not fix it. Never tell
    // someone to retry when retrying cannot work.
    for (const r of [outreach, metrics]) {
      expect(message(r)).toMatch(/re-uploading the same file will not help/i);
    }
  });

  it("⚠️ tells the LinkedIn uploader to split the file — which is safe there", () => {
    // Posts are matched on their own id and upserted, so two halves converge on
    // the same set. Splitting is a real remedy on this path.
    expect(message(metrics)).toMatch(/split/i);
  });

  it("⚠️ tells the Outreach uploader NOT to split — which would CORRUPT the data", () => {
    // ⚠️ THE DIVERGENCE THAT MATTERS, AND THE REASON THIS TAKES A `kind`. Every
    // outreach upload is stored as a COMPLETE snapshot of the roster (ADR 0012),
    // and the funnel reads the latest one. Uploading half the export would
    // create a snapshot saying the prospect list had halved — a confident, wrong
    // figure on the Client's own report. "Split it" is a real remedy on the
    // LinkedIn path and a data-corruption instruction on this one.
    expect(message(outreach)).toMatch(/do not split|not split/i);
    expect(message(outreach)).toMatch(/complete snapshot/i);
  });

  it("names a change to ArcBase as the remedy, and invents no other", () => {
    // ⚠️ NO "contact support" — there is no such thing here. No storage-upload
    // path either: it is deliberately not built, so pointing anyone at it would
    // be describing a feature that does not exist.
    for (const r of [outreach, metrics]) {
      expect(message(r)).toMatch(/change to ArcBase/i);
      expect(message(r)).not.toMatch(/support|storage|bucket/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DRIFT GUARD — the only thing holding the twin together.
//
// `SERVER_ACTION_BODY_LIMIT_BYTES` is a hand-copy of Next's
// `serverActions.bodySizeLimit`. It has to be: that is build-time config and
// this is a browser-side guard, so there is no import that would keep them in
// step. Until this existed the correspondence rested on comments, and a comment
// has never stopped anyone editing a number.
//
// ⚠️ BOTH DRIFT DIRECTIONS FAIL SILENTLY, WHICH IS WHY THIS IS WORTH A TEST:
//   • config RAISED, constant not → the guard refuses files that would have
//     fitted, and tells staff a confident number that is now wrong;
//   • config LOWERED, constant not → the guard passes files that die in
//     transport, reintroducing the exact invisible failure it exists to remove.
//
// Built after two precedents rather than as a new pattern: `sql-sync.test.ts`
// (two files must agree, comments stripped before comparing) and
// `roles.test.ts` (read a module's own source to pin a rule nothing else would
// catch, with guard-the-guard assertions beside it).
// ─────────────────────────────────────────────────────────────────────────────

describe("next.config.ts ⇄ SERVER_ACTION_BODY_LIMIT_BYTES", () => {
  const CONFIG = join(process.cwd(), "next.config.ts");
  const source = readFileSync(CONFIG, "utf8");

  /**
   * The config with comments stripped.
   *
   * ⚠️ NOT OPTIONAL, AND THIS REPO HAS BEEN BITTEN BY EXACTLY THIS SHAPE. The
   * ⚠️ block above `bodySizeLimit` discusses "1 MB", "4 MB" and "4.5 MB" in
   * prose, and its newest paragraph names `bodySizeLimit` itself — so a regex
   * over raw text can match an explanatory sentence instead of the setting, and
   * would then be pinning the comment rather than the code. S1's
   * `drop function` assertions failed against comments written to forbid
   * `drop function`; same trap, different file.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /**
   * `"4mb"` → 4,194,304.
   *
   * ⚠️ 1024-BASED, BECAUSE THAT IS WHAT NEXT DOES. Next parses this string with
   * the `bytes` package, where `mb` is 1024² — NOT 10⁶. Parsing it decimally
   * here would make the guard agree with a constant that is ~194 KB too large,
   * which is precisely the mistake the guard exists to catch.
   *
   * Returns `null` for anything it does not recognise, so an unparseable value
   * is a loud failure rather than a silent zero.
   */
  function parseBytes(literal: string): number | null {
    const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(literal.trim());
    if (!match) return null;
    const factor = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[match[2]!.toLowerCase()]!;
    return Number(match[1]) * factor;
  }

  /** The declared `bodySizeLimit` string, or `null` if it is not a plain literal. */
  function declaredLimit(configSource: string): string | null {
    const stripped = configSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return /\bbodySizeLimit\s*:\s*["'`]([^"'`]+)["'`]/.exec(stripped)?.[1] ?? null;
  }

  it("guard the guard: the stripped config still contains the setting", () => {
    // ⚠️ A REGEX THAT SILENTLY MATCHES NOTHING IS WORSE THAN NO TEST. If the
    // stripping emptied the file, or the path were wrong, every assertion below
    // would pass while checking nothing at all.
    expect(code).toContain("bodySizeLimit");
    expect(code).toContain("serverActions");
  });

  it("guard the guard: stripping removed the PROSE that mentions other sizes", () => {
    // The raw file talks about 1 MB, 4 MB and 4.5 MB; the code does not. If this
    // ever fails, the extraction below may be reading a sentence.
    expect(source).toMatch(/4\.5 MB/);
    expect(code).not.toMatch(/4\.5 MB/);
  });

  it("⚠️ the declared limit PARSES TO the constant this module ships", () => {
    // ⚠️ THE ASSERTION THAT MATTERS. Not "the file still says 4mb" — that would
    // pass if someone changed both the config and the constant inconsistently,
    // and says nothing about the RELATIONSHIP. This compares the two VALUES, so
    // a change on either side alone fails.
    const declared = declaredLimit(source);
    expect(declared, "bodySizeLimit is no longer a plain string literal").not.toBeNull();

    const bytes = parseBytes(declared!);
    expect(bytes, `could not parse bodySizeLimit: ${declared}`).not.toBeNull();
    expect(
      bytes,
      "next.config.ts and SERVER_ACTION_BODY_LIMIT_BYTES have drifted — change both",
    ).toBe(SERVER_ACTION_BODY_LIMIT_BYTES);
  });

  it("parses the `bytes` package's units the way Next will", () => {
    expect(parseBytes("4mb")).toBe(4_194_304);
    // ⚠️ NOT 4,000,000. A decimal reading is the whole trap.
    expect(parseBytes("4mb")).not.toBe(4_000_000);
    expect(parseBytes("1mb")).toBe(1_048_576);
    expect(parseBytes("512kb")).toBe(524_288);
    expect(parseBytes("1gb")).toBe(1_073_741_824);
    expect(parseBytes("2048b")).toBe(2048);
  });

  it("returns null for a value it cannot read, rather than guessing", () => {
    expect(parseBytes("lots")).toBeNull();
    expect(parseBytes("")).toBeNull();
    expect(parseBytes("4tb")).toBeNull();
  });

  it("⚠️ FAILS on a config whose limit disagrees — proving it can fail at all", () => {
    // ⚠️ RED-PROVED WITHOUT TOUCHING `next.config.ts`. The real file is
    // DO-NOT-TOUCH here, so the mismatch is staged against a fixture instead —
    // which demonstrates the same thing: a config declaring a different limit is
    // detected rather than shrugged at.
    const drifted = `experimental: { serverActions: { bodySizeLimit: "8mb" } }`;
    expect(parseBytes(declaredLimit(drifted)!)).not.toBe(SERVER_ACTION_BODY_LIMIT_BYTES);
    expect(parseBytes(declaredLimit(drifted)!)).toBe(8_388_608);
  });

  it("⚠️ IGNORES a bodySizeLimit written in a COMMENT", () => {
    // ⚠️ THE TRAP THIS FILE'S STRIPPING EXISTS FOR. A raw-text regex would read
    // the commented-out line first and pin a number nothing ships.
    const withProse = [
      `// we considered bodySizeLimit: "16mb" and rejected it`,
      `/* an older note: bodySizeLimit: "1mb" was the default */`,
      `      bodySizeLimit: "4mb",`,
    ].join("\n");

    expect(declaredLimit(withProse)).toBe("4mb");
  });

  it("finds nothing — rather than something wrong — when the setting is gone", () => {
    // Removal must surface as `null`, which the assertion above turns into a
    // failure. Silently passing on an absent setting is the vacuous-guard
    // failure mode.
    expect(declaredLimit(`experimental: { serverActions: {} }`)).toBeNull();
    expect(declaredLimit(`// bodySizeLimit: "4mb"`)).toBeNull();
  });
});
