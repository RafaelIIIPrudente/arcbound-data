import type { ClientWriter } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// ONE FAN-OUT OVER `ClientWriter`'S FOUR STATES, TWO WORDINGS.
//
// The Client List cell and the Client Overview card both have to turn the same
// four-state value into text, and they need DIFFERENT text: a table cell holds a
// terse label, a card holds a sentence. Two copies of the dispatch had grown, so
// a fifth state — or a corrected reading of an existing one — would have had to
// be found twice.
//
// ⚠️ THE WORDING DIVERGES; THE MEANING MUST NOT. `unknown` is a broken LINK (the
// assignment points at an account that is gone, and only a human can fix it) and
// `unavailable` is a broken READ (the assignment is probably fine, try again).
// Collapsing either of them — or `null` — into "nobody is assigned" reports a
// staffing gap that does not exist. Keeping both wordings in one file is what
// makes a drift between them visible.
// ─────────────────────────────────────────────────────────────────────────────

/** A writer whose staff directory read SUCCEEDED — the three states with text. */
export type KnownWriter = Exclude<ClientWriter, { status: "unavailable" }>;

/** What a surface calls the two states that are not an email address. */
export interface WriterWording {
  /** Nobody has been assigned. A known fact, never "missing data". */
  unset: string;
  /** Somebody IS assigned, to an account that no longer exists. */
  unknown: string;
}

/**
 * The label for a writer, in the caller's own vocabulary.
 *
 * ⚠️ `unavailable` IS NOT HANDLED HERE, ON PURPOSE. It is the only one of the
 * four states that is missing data rather than a fact, and each surface renders
 * it differently — the list as an em dash with screen-reader text, the card as a
 * sentence. Forcing it through a shared label would invite exactly the collapse
 * this module exists to prevent.
 */
export function writerLabel(writer: KnownWriter, wording: WriterWording): string {
  if (writer === null) return wording.unset;
  if (writer.status === "resolved") return writer.email;
  return wording.unknown;
}

/** The Client List cell: terse, because it shares a row with six other columns. */
export const WRITER_CELL_WORDING: WriterWording = {
  unset: "Not recorded",
  unknown: "Assigned · unknown account",
};

/** The Client Overview card: a sentence, because it has the room for one. */
export const WRITER_PROSE_WORDING: WriterWording = {
  unset: "Not recorded",
  unknown: "Assigned to an account that no longer exists",
};
