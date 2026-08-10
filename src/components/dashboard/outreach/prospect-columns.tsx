"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";

import { canonicalReply, canonicalStage, REPLY_BUCKET_LABELS } from "@/lib/outreach-vocab";
import type { OutreachProspect } from "@/services/types";

import { ConnectionStatusPill, IcpSegPill, ReplyStatusPill } from "./outreach-pill";

// ─────────────────────────────────────────────────────────────────────────────
// All 39 source columns of the "Master Database" export, in the order the
// export writes them — the original 24, then the 15 `Email — *` columns
// appended 2026-08-03 (docs/decisions/2026-08-03-outreach-email-channel.md).
//
// ⚠️ SOURCE ORDER, NOT AN ORDER WE PREFER. Staff read this table against the
// spreadsheet, so the columns march past in the same sequence their eye already
// knows. Re-ordering by "importance" would be a small kindness that costs every
// reconciliation.
//
// ⚠️ NO ArcBase BOOKKEEPING COLUMNS. `id`, `outreachUploadId`, `clientId` and
// `rowIndex` exist on `OutreachProspect` but are not in the sheet, and putting
// database identifiers in a table meant for spreadsheet-matching would be noise
// at best and a false column at worst.
//
// ⚠️ A NULL CELL RENDERS EMPTY — never "0", "—", "null" or "N/A". `Next Touch
// Date` is filled on 2 rows of 1,435 and `Meeting Booked` on 8, so blank is the
// ORDINARY state of this data; a placeholder would be ArcBase asserting
// something the export did not say, over a thousand times per column.
//
// ⚠️ ALL 39 COLUMNS EXIST HERE, ALWAYS — THE LinkedIn / Email / All TOGGLE IS
// VISIBILITY ONLY (D5). `prospect-table.tsx` hides columns via TanStack's
// `columnVisibility`, never by filtering this array, so a column's presence
// here is not a claim about what is on screen right now.
//
// ⚠️ THE TOGGLE IS A PRIVACY BOUNDARY, NOT ONLY A LAYOUT CHOICE (D5). Two of
// the 15 Email columns — `Email — Best Email`, `Email — Mobile` — are direct
// contact details for third parties who never agreed to be in ArcBase. Staff
// must deliberately switch to the Email or All view to see them; the default
// keeps this table's worst exposure at names and profile URLs, not a contact
// list with phone numbers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which channel a column's source column belongs to.
 *
 * ⚠️ THIS IS THE SINGLE SOURCE OF TRUTH FOR THE LinkedIn / Email / All TOGGLE
 * (D5, 2026-08-03). `prospect-table.tsx` derives `LINKEDIN_COLUMN_IDS` and
 * `EMAIL_COLUMN_IDS` from this field rather than carrying a second, hand-typed
 * id list — two lists that must stay in step is exactly the `PROSPECT_COLUMNS`
 * / `ProspectRow` drift risk this codebase has already been burned by once.
 */
export type ProspectColumnChannel = "linkedin" | "email";

/** Column meta: layout, the sort button's word, and the literal sheet header. */
export interface ProspectColumnMeta {
  className?: string;
  /**
   * The header EXACTLY as the export spells it, including any parenthetical the
   * visible label drops for width. Surfaced as a tooltip so a staffer
   * reconciling against the file can always recover the literal name.
   */
  sourceHeader: string;
  channel: ProspectColumnChannel;
}

/** Which fields of `OutreachProspect` come from the sheet. */
type SourceField = Exclude<
  keyof OutreachProspect,
  "id" | "outreachUploadId" | "clientId" | "rowIndex"
>;

/**
 * Exact, trimmed equality against the stored value.
 *
 * ⚠️ EQUALITY, NOT TanStack's DEFAULT SUBSTRING MATCH. The default `includes`
 * filter would let a dropdown pick of "Connected" also select a row reading
 * "Not Connected", and it silently did the right thing for today's two-value
 * column only by luck. A dropdown built from present values means the user
 * chose a whole value; matching it as a whole value is what they asked for.
 */
const equalsRaw =
  (field: SourceField): FilterFn<OutreachProspect> =>
  (row, _columnId, value) =>
    (row.original[field] ?? "").trim() === value;

/**
 * Match on the CANONICAL form, not the raw text.
 *
 * ⚠️ THIS IS WHY THE STAGE AND REPLY DROPDOWNS WORK AT ALL. A Stage stored as
 * "closed-low fit" is offered in the menu as "Closed - Low Fit", so a raw
 * comparison would return nothing for a row the user can see. The reply filter
 * goes further and groups: eight distinct date-suffixed strings all answer to
 * one bucket, which is the entire reason that dropdown has ~7 entries instead of
 * 15. The CELL still shows the raw text — grouping is not renaming.
 */
const matchesCanonical =
  (toCanonical: (row: OutreachProspect) => string | null): FilterFn<OutreachProspect> =>
  (row, _columnId, value) =>
    toCanonical(row.original) === value;

/**
 * Which channel a field belongs to, derived from its NAME.
 *
 * ⚠️ EVERY `email*` FIELD IS THE EMAIL CHANNEL, AND THAT IS NOT A COINCIDENCE
 * — `OutreachProspect`'s 15 new fields (2026-08-03) are all prefixed `email`,
 * so this derivation cannot drift from the type the way a hand-typed id list
 * could.
 */
function channelOf(field: SourceField): ProspectColumnChannel {
  return field.startsWith("email") ? "email" : "linkedin";
}

/**
 * A plain text cell: clamped to three lines, with the whole value on hover.
 *
 * ⚠️ CLAMPED, NOT TRUNCATED IN THE DATA. `LinkedIn Message` holds drafted
 * paragraphs and `Notes` holds free text; three lines keeps a row scannable
 * while `title` keeps every character reachable. Nothing is cut from the value
 * itself.
 */
function text(
  field: SourceField,
  label: string,
  sourceHeader: string,
): ColumnDef<OutreachProspect> {
  return {
    id: field,
    accessorFn: (row) => row[field] ?? "",
    header: label,
    meta: {
      sourceHeader,
      channel: channelOf(field),
      className: "min-w-[11rem] max-w-[18rem] align-top",
    },
    cell: ({ row }) => {
      const value = row.original[field];
      if (value === null || value.trim() === "") return null;
      return (
        <span className="line-clamp-3 text-[12.5px] leading-snug" title={value}>
          {value}
        </span>
      );
    },
  };
}

/** A short text cell — dates, counts, single words. Narrower, still clamped. */
function compact(
  field: SourceField,
  label: string,
  sourceHeader: string,
): ColumnDef<OutreachProspect> {
  return {
    id: field,
    accessorFn: (row) => row[field] ?? "",
    header: label,
    meta: { sourceHeader, channel: channelOf(field), className: "min-w-[7.5rem] align-top" },
    cell: ({ row }) => {
      const value = row.original[field];
      if (value === null || value.trim() === "") return null;
      return (
        <span className="line-clamp-3 font-mono text-[11.5px] leading-snug" title={value}>
          {value}
        </span>
      );
    },
  };
}

/** A pilled status cell. The pill itself renders nothing for a blank value. */
function pill(
  field: SourceField,
  label: string,
  sourceHeader: string,
  Render: (props: { value: string | null }) => React.ReactNode,
): ColumnDef<OutreachProspect> {
  return {
    id: field,
    // ⚠️ SORTS AND FILTERS ON THE RAW VALUE, NOT THE BUCKET. The cell shows the
    // stored text, so clicking the header must order by the same thing the eye
    // sees. Bucketing belongs to the Reply filter, which is explicit about it.
    accessorFn: (row) => row[field] ?? "",
    header: label,
    meta: { sourceHeader, channel: channelOf(field), className: "min-w-[9rem] align-top" },
    cell: ({ row }) => <Render value={row.original[field]} />,
  };
}

export const prospectColumns: ColumnDef<OutreachProspect>[] = [
  {
    id: "fullName",
    accessorFn: (row) => row.fullName ?? "",
    header: "Full Name",
    meta: {
      sourceHeader: "Full Name",
      channel: "linkedin",
      className: "min-w-[10rem] align-top",
    },
    cell: ({ row }) => {
      const value = row.original.fullName;
      if (value === null || value.trim() === "") return null;
      return (
        <span className="font-medium whitespace-nowrap" title={value}>
          {value}
        </span>
      );
    },
  },
  text("title", "Title", "Title"),
  text("company", "Company", "Company"),
  { ...pill("icpSeg", "ICP Seg", "ICP Seg", IcpSegPill), filterFn: equalsRaw("icpSeg") },
  text("whyTheyFit", "Why They Fit", "Why They Fit (signal)"),
  text("whatTheyLack", "What They Lack", "What They Lack"),
  text("whatArcboundOffers", "What Arcbound Offers", "What Arcbound Offers (tier + hook)"),
  text("matchingClientArchetype", "Matching Client Archetype", "Matching Client Archetype"),
  {
    id: "linkedinUrl",
    accessorFn: (row) => row.linkedinUrl ?? "",
    header: "LinkedIn URL",
    meta: {
      sourceHeader: "LinkedIn URL",
      channel: "linkedin",
      className: "min-w-[7rem] align-top",
    },
    cell: ({ row }) => {
      const value = row.original.linkedinUrl;
      if (value === null || value.trim() === "") return null;
      return (
        <a
          href={value}
          target="_blank"
          // ⚠️ NOT OPTIONAL on a target=_blank link to a third-party profile:
          // without `noopener` the opened page gets a handle back on this one,
          // and this one is an authenticated staff screen.
          rel="noreferrer noopener"
          title={value}
          className="inline-flex items-center gap-1 font-mono text-[11.5px] text-primary underline-offset-2 hover:underline"
        >
          profile
          <ExternalLink className="size-3" aria-hidden />
        </a>
      );
    },
  },
  text("location", "Location", "Location"),
  text("sourceCitation", "Source / Citation", "Source / Citation"),
  text("rationale", "Rationale", "Rationale (1-line)"),
  text("linkedinMessage", "LinkedIn Message", "LinkedIn Message"),
  {
    ...pill("connectionStatus", "Connection Status", "Connection Status", ConnectionStatusPill),
    filterFn: equalsRaw("connectionStatus"),
  },
  compact("dateSent", "Date Sent", "Date Sent"),
  {
    ...pill("replyStatus", "Reply Status", "Reply Status", ReplyStatusPill),
    filterFn: matchesCanonical((row) => REPLY_BUCKET_LABELS[canonicalReply(row.replyStatus)]),
  },
  compact("followUpCount", "Follow-up Count", "Follow-up Count"),
  compact("lastFollowUpDate", "Last Follow-up Date", "Last Follow-up Date"),
  compact("nextTouchDate", "Next Touch Date", "Next Touch Date"),
  compact("meetingBookedDate", "Meeting Booked", "Meeting Booked (date)"),
  {
    ...compact("stage", "Stage", "Stage"),
    filterFn: matchesCanonical((row) => canonicalStage(row.stage)),
  },
  compact("owner", "Owner", "Owner"),
  text("notes", "Notes", "Notes"),
  compact("qualifiedIcp", "Qualified (ICP)", "Qualified (ICP)"),

  // ── The 15 Email — * columns, appended 2026-08-03, source order ──────────
  compact("emailBestEmail", "Email Address", "Email — Best Email"),
  compact("emailMobile", "Email Mobile", "Email — Mobile"),
  text("emailSubjectLine", "Email Subject", "Email — Subject Line"),
  text("emailMessage", "Email Message", "Email — Message"),
  // ⚠️ NO PILL, NO CANONICALISATION (D2). `Email — Status` is stale — 'Drafted'
  // on 625 rows that also carry a send date — and no figure or classification
  // may be derived from it anywhere, including here. It is shown as raw text,
  // exactly as ADR 0009 stores it, and nothing more.
  compact("emailStatus", "Email Status", "Email — Status"),
  compact("emailDateEmailed", "Email Date Emailed", "Email — Date Emailed"),
  pill("emailReplyStatus", "Email Reply Status", "Email — Reply Status", ReplyStatusPill),
  compact("emailFollowUpCount", "Email Follow-up Count", "Email — Follow-up Count"),
  compact("emailLastFollowUpDate", "Email Last Follow-up", "Email — Last Follow-up Date"),
  compact("emailNextTouchDate", "Email Next Touch", "Email — Next Touch Date"),
  compact("emailWebinarRegistered", "Email Webinar Registered", "Email — Webinar Registered"),
  compact("emailMeetingBookedDate", "Email Meeting Booked", "Email — Meeting Booked (date)"),
  compact("emailStage", "Email Stage", "Email — Stage"),
  compact("emailOwner", "Email Owner", "Email — Owner"),
  text("emailNotes", "Email Notes", "Email — Notes"),
];
