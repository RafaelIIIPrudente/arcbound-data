"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";

import { canonicalReply, canonicalStage, REPLY_BUCKET_LABELS } from "@/lib/outreach-vocab";
import type { OutreachProspect } from "@/services/types";

import { ConnectionStatusPill, IcpSegPill, ReplyStatusPill } from "./outreach-pill";

// ─────────────────────────────────────────────────────────────────────────────
// The 24 source columns of the "Master Database" export, in the order the export
// writes them.
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
// ─────────────────────────────────────────────────────────────────────────────

/** Column meta: layout, the sort button's word, and the literal sheet header. */
export interface ProspectColumnMeta {
  className?: string;
  /**
   * The header EXACTLY as the export spells it, including any parenthetical the
   * visible label drops for width. Surfaced as a tooltip so a staffer
   * reconciling against the file can always recover the literal name.
   */
  sourceHeader: string;
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
    meta: { sourceHeader, className: "min-w-[11rem] max-w-[18rem] align-top" },
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
    meta: { sourceHeader, className: "min-w-[7.5rem] align-top" },
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
    meta: { sourceHeader, className: "min-w-[9rem] align-top" },
    cell: ({ row }) => <Render value={row.original[field]} />,
  };
}

export const prospectColumns: ColumnDef<OutreachProspect>[] = [
  {
    id: "fullName",
    accessorFn: (row) => row.fullName ?? "",
    header: "Full Name",
    meta: { sourceHeader: "Full Name", className: "min-w-[10rem] align-top" },
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
    meta: { sourceHeader: "LinkedIn URL", className: "min-w-[7rem] align-top" },
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
];
