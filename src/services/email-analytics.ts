import { canonicalReply, replyQualifier } from "@/lib/outreach-vocab";
import type { EmailAnalytics, OutreachFunnelStep, OutreachProspect } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The Email channel's own funnel, computed from ONE snapshot. PURE: no I/O, no
// clock, no randomness — the same rows always give the same figures.
//
// ⚠️ A SEPARATE BUILDER FROM `buildOutreachAnalytics`, DELIBERATELY (D1,
// docs/decisions/2026-08-03-outreach-email-channel.md). The LinkedIn funnel
// keeps its four steps and its numbers exactly as they are; the Email funnel
// sits beside it with its own three steps, and the page never adds the two.
// Two separate builders make that impossible to violate by accident — there is
// no shared object in which the funnels could be summed.
//
// ⚠️ COUNTS ONLY. No rate, percentage, score, rank or benchmark anywhere here —
// the same no-score discipline binding `outreach-analytics.ts` binds this file.
//
// ⚠️ `Email — Status` IS NEVER READ HERE (D2). It reads 'Drafted' on 625 rows
// that also carry a send date, and only 4 rows anywhere read 'Sent'. Arcbound
// confirmed `Email — Date Emailed` is the real send signal and the status
// column is simply not maintained — a future reader who reaches for the 96%
// 'Drafted' majority would be reaching for exactly the wrong column.
// ─────────────────────────────────────────────────────────────────────────────

/** A cell that carries no value: null, empty, or whitespace only. */
function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

/** Distinct values, in first-seen order, so a disclosure list is stable. */
function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Build the Email channel's funnel for one snapshot.
 *
 * ⚠️ `hasEmailChannel` DECIDES THE RESULT, NOT THE ROWS (D3). A snapshot
 * uploaded before the email channel existed has NULL email columns on every
 * row; without the flag that would read as a real zeroed funnel rather than
 * "not in this export". The flag is checked FIRST and unconditionally — a
 * `false` short-circuits to `{ status: "not-in-export" }` even if the rows
 * somehow carry email values, because the flag states what the FILE carried,
 * which is the fact this function exists to preserve.
 */
export function buildEmailAnalytics(
  prospects: OutreachProspect[],
  hasEmailChannel: boolean,
): EmailAnalytics {
  if (!hasEmailChannel) return { status: "not-in-export" };

  // ── The funnel: THREE steps, no acceptance gate over email ────────────────
  const sent = prospects.filter((p) => !isBlank(p.emailDateEmailed)).length;

  // ⚠️ SAME RULE AS THE LINKEDIN REPLIED STEP: "somebody answered", which is
  // NOT the same test as "not No reply". A blank must not count — it is
  // nobody writing anything down, not evidence of an unstated reply.
  const replied = prospects.filter((p) => {
    const bucket = canonicalReply(p.emailReplyStatus);
    return bucket !== "no-reply" && bucket !== "not-recorded";
  }).length;

  const meetings = prospects.filter((p) => !isBlank(p.emailMeetingBookedDate)).length;

  const funnel: OutreachFunnelStep[] = [
    {
      label: "Emails sent",
      count: sent,
      source: "Email — Date Emailed",
      rule: "a value is recorded in Email — Date Emailed",
    },
    {
      label: "Replied",
      count: replied,
      source: "Email — Reply Status",
      rule: "Email — Reply Status is anything other than No reply, and is not blank",
    },
    {
      label: "Meetings booked",
      count: meetings,
      source: "Email — Meeting Booked (date)",
      rule: "a date is recorded in Email — Meeting Booked (date)",
    },
  ];

  // ⚠️ A UNION, COMPUTED AS ONE (D1) — NEVER THE SUM OF THE TWO FUNNELS'
  // BOTTOM STEPS. 8 prospects carry a booked meeting in BOTH the LinkedIn
  // `meetingBookedDate` and the Email `emailMeetingBookedDate` columns in the
  // observed export, so `meetings + emailMeetings` overstates the true union
  // by exactly those 8 (27 where the truth is 19).
  const combinedMeetings = prospects.filter(
    (p) => !isBlank(p.meetingBookedDate) || !isBlank(p.emailMeetingBookedDate),
  ).length;

  // ⚠️ A DISCLOSURE, NEVER A FILTER (D2). These rows are already counted in
  // `sent` above — `Email — Date Emailed` alone defines that step — this
  // figure only surfaces the discrepancy for a human to see.
  const sentWithoutAddress = prospects.filter(
    (p) => !isBlank(p.emailDateEmailed) && isBlank(p.emailBestEmail),
  ).length;

  const unrecognisedReplyValues = distinct(
    prospects
      .filter((p) => canonicalReply(p.emailReplyStatus) === "unrecognised")
      // Non-null by construction: a blank status is `not-recorded`, never
      // `unrecognised`, so anything reaching here has text to show.
      .map((p) => p.emailReplyStatus!.trim()),
  );

  // ⚠️ RECOVERABLE AND DISCLOSED (D6) — what makes stripping the qualifier in
  // `canonicalReply` safe at all. One observed value is `Replied - Positive
  // (via email; meeting canceled)`, where the qualifier arguably reverses the
  // outcome; it charts as Positive WITH the cancellation listed here.
  const strippedQualifiers = distinct(
    prospects
      .map((p) => replyQualifier(p.emailReplyStatus))
      .filter((qualifier): qualifier is string => qualifier !== null),
  );

  return {
    status: "ok",
    funnel,
    combinedMeetings,
    sentWithoutAddress,
    unrecognisedReplyValues,
    strippedQualifiers,
  };
}
