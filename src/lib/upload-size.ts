// ─────────────────────────────────────────────────────────────────────────────
// THE ONLY PLACE AN OVER-LIMIT UPLOAD CAN BE CAUGHT.
//
// ⚠️ PAST THE SERVER ACTION BODY LIMIT, THE REQUEST IS REJECTED IN TRANSPORT —
// before any action code runs. No validation message, no parse error, nothing a
// form could render: the user picks a file, presses the button, and the app does
// not respond. There is NO server-side fix, because by the time our code could
// run the request is already gone. Adding a check inside the action would be
// dead code that looks like protection.
//
// So this module runs in the BROWSER, before submit, and its whole job is to
// turn a silent failure into a sentence.
//
// ⚠️ IT DOES NOT RAISE THE CEILING; IT MAKES THE EXISTING ONE VISIBLE. The
// durable answer for a materially larger export is a browser→storage upload with
// server-side ingest, which never puts the bytes in a Server Action body at all.
// That is deliberately not built — see `next.config.ts`, which explains why
// raising `bodySizeLimit` buys nothing (Vercel caps the request at ~4.5 MB
// UPSTREAM of Next, so past that the setting is never consulted).
//
// ⚠️ FRAMEWORK-FREE ON PURPOSE. Text in, decision out. No React, no DOM beyond
// `TextEncoder`, so the arithmetic and the wording are testable without
// rendering anything.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Next's configured `serverActions.bodySizeLimit`, in bytes.
 *
 * ⚠️ 1024-BASED, NOT 1000-BASED. `next.config.ts` says `"4mb"`, which Next parses
 * with the `bytes` package where `mb` is 1024² — so this is 4,194,304 and NOT
 * 4,000,000. A reader who assumed the decimal value would compute ~194 KB of
 * headroom that does not exist.
 *
 * ⚠️ KEEP THIS IN STEP WITH `next.config.ts`. There is no way to import that
 * value here (it is a build-time config, and this runs in the browser), so the
 * two are a PAIR held together by comments on both sides.
 */
export const SERVER_ACTION_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * How much of the limit is reserved for everything that is NOT the CSV text.
 *
 * ⚠️ THE LIMIT IS ON THE WHOLE BODY, NOT ON `rawText`. Riding along with it:
 * multipart framing and boundaries, the Server Action id, every field name, and
 * the other fields themselves — `clientId`, `sourceType`, `followerCount`,
 * `connectionsCount`, sometimes `skipReview`.
 *
 * ⚠️ AND ONE FIELD THAT IS NOT FIXED-SIZE: `resolvedFormatTypes`, which the
 * LinkedIn form sends as JSON on its SECOND submit — one entry per post, keyed
 * by LinkedIn's long activity urn, so roughly 60 bytes per post. At the sizes
 * this guard is about that is the dominant term: a ~3.5 MB metrics CSV can carry
 * several thousand posts, so several hundred KB of format types. THAT is what
 * this reserve is mostly for.
 *
 * ⚠️ 512 KiB IS A JUDGEMENT, NOT A MEASUREMENT, and is deliberately generous
 * rather than tight. Being too generous costs a little capacity; being too tight
 * restores the exact silent failure this module exists to remove. Nothing here
 * has been checked against a real over-limit request.
 */
export const ENVELOPE_HEADROOM_BYTES = 512 * 1024;

/**
 * The largest CSV/JSON text this transport can be relied on to carry.
 *
 * 3,670,016 bytes (3.5 MiB). For scale, using the ~1,041 bytes/row measured on
 * the 2026-07-27 Outreach export, that is roughly 3,500 prospects — against
 * 1,435 today. The real file has about 2.4x of room left.
 */
export const MAX_UPLOAD_TEXT_BYTES = SERVER_ACTION_BODY_LIMIT_BYTES - ENVELOPE_HEADROOM_BYTES;

/**
 * How many BYTES this text becomes on the wire.
 *
 * ⚠️ NEVER `text.length`. That is a UTF-16 code-unit count: "é" is one unit and
 * two UTF-8 bytes, "→" is one unit and three. These files are full of human
 * names and company names, so a length-based count undercounts routinely — and
 * it undercounts in the direction that lets an over-limit file through, which is
 * the one direction that matters.
 */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Which upload path this is — because the two have DIFFERENT correct remedies.
 *
 * ⚠️ NOT COSMETIC. See `tooLargeMessage`: telling an Outreach uploader to split
 * their file would corrupt their Client's figures.
 */
export type UploadKind = "outreach" | "metrics";

export type UploadSizeCheck =
  { status: "ok" } | { status: "too-large"; bytes: number; message: string };

/**
 * MiB to one decimal — the same base the limit is expressed in.
 *
 * ⚠️ THE FILE ROUNDS UP AND THE LIMIT ROUNDS DOWN, AND THAT IS NOT FUSSINESS.
 * Rounding both the same way makes a file one byte over the threshold read
 * "This file is 3.5 MB, and one upload can carry about 3.5 MB" — a sentence that
 * refuses a file for being the same size as the limit, which reads as a bug in
 * ArcBase rather than a fact about the file. Rounding them apart keeps the two
 * numbers distinct at the boundary, and errs conservatively in both directions:
 * the file never looks smaller than it is, the limit never looks larger.
 */
function mb(bytes: number, round: "up" | "down"): string {
  const value = bytes / 1024 / 1024;
  const rounded = round === "up" ? Math.ceil(value * 10) / 10 : Math.floor(value * 10) / 10;
  return `${rounded.toFixed(1)} MB`;
}

/**
 * What the person reads. This is the point of the module.
 *
 * ⚠️ IT MUST SAY RE-UPLOADING THE SAME FILE WILL NOT HELP. Matching the register
 * of `unknownColumnWarning` in `upload/outreach-actions.ts`, which says plainly
 * that the data was not stored and that re-uploading will not fix it. Never tell
 * someone to retry when retrying cannot work — they will do it twice before
 * concluding the app is broken.
 *
 * ⚠️ AND IT MUST NOT INVENT A REMEDY. There is no "contact support" here, and
 * the storage-upload path is deliberately not built, so pointing anyone at one
 * would describe a feature that does not exist. What is true is that carrying a
 * file this size needs a change to ArcBase.
 */
function tooLargeMessage(bytes: number, kind: UploadKind): string {
  const head =
    `This file is ${mb(bytes, "up")}, and one upload can carry about ` +
    `${mb(MAX_UPLOAD_TEXT_BYTES, "down")}. ` +
    `Nothing was sent — it would have been rejected in transit with no message at all, ` +
    `which is why ArcBase stops it here instead. ` +
    `Re-uploading the same file will not help.`;

  // ⚠️ THE REMEDIES DIVERGE, AND GETTING THIS BACKWARDS CORRUPTS DATA.
  //
  // LinkedIn posts are matched on their own id and upserted, so uploading the
  // file in halves converges on exactly the same set of posts. Splitting is a
  // real, safe remedy there.
  //
  // An outreach upload is stored as a COMPLETE SNAPSHOT of the roster (ADR
  // 0012), and every figure on the Client's report reads the latest one. Half
  // the export would become a snapshot asserting that the prospect list had
  // halved — a confident, wrong number on a client-facing surface, and one that
  // the movement panel would then report as a collapse. So the same sentence
  // that helps one uploader would quietly damage the other's data.
  if (kind === "metrics") {
    return (
      `${head} Split the export into smaller files and upload them one after another — ` +
      `posts are matched on their own id, so the parts merge into one set. ` +
      `Carrying a file this size in a single upload needs a change to ArcBase.`
    );
  }

  return (
    `${head} Do not split the file either: every outreach upload is stored as a complete ` +
    `snapshot of the prospect list, so uploading part of the export would record a snapshot ` +
    `saying the list had shrunk. Carrying a file this size needs a change to ArcBase — ` +
    `tell whoever maintains it rather than working around it here.`
  );
}

/**
 * Is this text small enough to send?
 *
 * ⚠️ EMPTY IS `ok`, DELIBERATELY. "You have not chosen a file" is the existing
 * field validation's job; answering it here would tell someone who selected
 * nothing that their file was too big.
 *
 * ⚠️ THE BOUNDARY IS INCLUSIVE. The threshold is what fits, not what fails.
 */
export function checkUploadSize(text: string, kind: UploadKind): UploadSizeCheck {
  const bytes = utf8Bytes(text);
  if (bytes <= MAX_UPLOAD_TEXT_BYTES) return { status: "ok" };
  return { status: "too-large", bytes, message: tooLargeMessage(bytes, kind) };
}
