import { AlertTriangle } from "lucide-react";

import type { EmailAnalytics, OutreachAnalytics } from "@/services/types";

/**
 * Everything this page could not interpret, or counted and then excluded.
 *
 * ⚠️ THE PAGE'S CONSCIENCE, AND THE REASON NOTHING ABOVE NEEDS AN "OTHER"
 * BUCKET. Values ArcBase has not been taught to read are printed here character
 * for character, exactly as somebody typed them into the sheet — because the
 * only person who can say what "Replied - Interested" means is a human reading
 * the original words. Summarising them into a count would destroy the one thing
 * that makes them actionable.
 *
 * ⚠️ IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. A caveat panel that
 * appears on every snapshot is a panel the reader learns to skip, and it would
 * be invisible on the day it finally matters.
 *
 * ⚠️ TWO SEPARATE DISCLOSURE LISTS PER CONCERN, ONE PER CHANNEL, NEVER MERGED
 * (2026-08-10, S3). LinkedIn's `unrecognisedReplyValues` and Email's are kept
 * apart, exactly as the two funnels are (D1) — a value unfamiliar on both
 * channels is printed twice, once per channel, so a reader always knows which
 * sheet column to go fix.
 */
export function OutreachDisclosure({
  analytics,
  emailAnalytics,
}: {
  analytics: OutreachAnalytics;
  emailAnalytics: EmailAnalytics;
}) {
  const {
    unrecognisedReplyValues,
    unrecognisedStageValues,
    strippedReplyQualifiers,
    undatedSent,
    unreadableSentValues,
    unreadableFollowUpCounts,
    sentDateRange,
  } = analytics;

  // ⚠️ `not-in-export` CONTRIBUTES NOTHING HERE. A snapshot with no email block
  // has nothing email-specific to disclose — that fact is stated once, by
  // `EmailFunnelPanel`, and is not repeated as a caveat on this panel too.
  const emailOk = emailAnalytics.status === "ok" ? emailAnalytics : null;

  const hasAnything =
    unrecognisedReplyValues.length > 0 ||
    unrecognisedStageValues.length > 0 ||
    strippedReplyQualifiers.length > 0 ||
    undatedSent > 0 ||
    unreadableSentValues.length > 0 ||
    unreadableFollowUpCounts > 0 ||
    sentDateRange !== null ||
    (emailOk !== null &&
      (emailOk.unrecognisedReplyValues.length > 0 ||
        emailOk.strippedQualifiers.length > 0 ||
        emailOk.sentWithoutAddress > 0));

  if (!hasAnything) return null;

  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-3.5 text-muted-foreground" aria-hidden />
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          What this page could not read
        </div>
      </div>

      <div className="space-y-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {unrecognisedReplyValues.length > 0 ? (
          <p>
            <span className="text-foreground">Reply status</span> — {unrecognisedReplyValues.length}{" "}
            value{unrecognisedReplyValues.length === 1 ? "" : "s"} ArcBase has not been taught to
            read. Prospects carrying them still count as having replied, but their sentiment is not
            grouped with any other: <VerbatimList values={unrecognisedReplyValues} />
          </p>
        ) : null}

        {unrecognisedStageValues.length > 0 ? (
          <p>
            <span className="text-foreground">Stage</span> — {unrecognisedStageValues.length} value
            {unrecognisedStageValues.length === 1 ? "" : "s"} outside the ten this sheet is known to
            use. Each is charted under its own name, not merged:{" "}
            <VerbatimList values={unrecognisedStageValues} />
          </p>
        ) : null}

        {strippedReplyQualifiers.length > 0 ? (
          <p>
            {/* ⚠️ A3 — REPAIRS A DISCLOSURE THAT WENT SILENT (2026-08-10). A
                trailing note like "(via email; meeting canceled)" is removed
                from a LinkedIn reply while grouping its sentiment; it is kept
                here rather than dropped, because one observed value's note
                arguably reverses the reply it is attached to. */}
            <span className="text-foreground">Reply status, note removed</span> —{" "}
            {strippedReplyQualifiers.length} trailing note
            {strippedReplyQualifiers.length === 1 ? "" : "s"} taken off a LinkedIn reply while
            grouping its sentiment, kept here rather than dropped:{" "}
            <VerbatimList values={strippedReplyQualifiers} />
          </p>
        ) : null}

        {emailOk && emailOk.unrecognisedReplyValues.length > 0 ? (
          <p>
            <span className="text-foreground">Email reply status</span> —{" "}
            {emailOk.unrecognisedReplyValues.length} value
            {emailOk.unrecognisedReplyValues.length === 1 ? "" : "s"} ArcBase has not been taught to
            read. Prospects carrying them still count as having replied on the Email funnel, but
            their sentiment is not grouped with any other:{" "}
            <VerbatimList values={emailOk.unrecognisedReplyValues} />
          </p>
        ) : null}

        {emailOk && emailOk.strippedQualifiers.length > 0 ? (
          <p>
            <span className="text-foreground">Email reply status, note removed</span> —{" "}
            {emailOk.strippedQualifiers.length} trailing note
            {emailOk.strippedQualifiers.length === 1 ? "" : "s"} taken off an email reply while
            grouping its sentiment, kept here rather than dropped:{" "}
            <VerbatimList values={emailOk.strippedQualifiers} />
          </p>
        ) : null}

        {emailOk && emailOk.sentWithoutAddress > 0 ? (
          <p>
            {/* ⚠️ A DISCLOSURE, NEVER A FILTER (D2). These rows still count as
                sent on the Email funnel above — Email — Date Emailed alone
                decides that step — this only notes the gap. */}
            <span className="text-foreground">Email sent without an address</span> —{" "}
            {n(emailOk.sentWithoutAddress)} prospect
            {emailOk.sentWithoutAddress === 1 ? " has" : "s have"} a send date recorded in Email —
            Date Emailed but no Email — Best Email on file. They still count as sent.
          </p>
        ) : null}

        {undatedSent > 0 ? (
          <p>
            <span className="text-foreground">Date sent</span> — {n(undatedSent)} prospect
            {undatedSent === 1 ? " has" : "s have"} no send date recorded. They are counted in the
            snapshot total but cannot appear on any timeline.
          </p>
        ) : null}

        {unreadableSentValues.length > 0 ? (
          <p>
            {/* ⚠️ KEPT APART FROM `undatedSent` ON PURPOSE. "Nobody wrote a date"
                and "somebody wrote something that is not a date" are different
                facts, and only the second is a sheet somebody can go and fix. */}
            <span className="text-foreground">Date sent, unreadable</span> —{" "}
            {unreadableSentValues.length} value
            {unreadableSentValues.length === 1 ? "" : "s"} recorded but not as a date:{" "}
            <VerbatimList values={unreadableSentValues} />
          </p>
        ) : null}

        {unreadableFollowUpCounts > 0 ? (
          <p>
            <span className="text-foreground">Follow-up count</span> — {n(unreadableFollowUpCounts)}{" "}
            row
            {unreadableFollowUpCounts === 1 ? "" : "s"} could not be read as a number, so they are
            excluded from the follow-up breakdown rather than counted as zero.
          </p>
        ) : null}

        {sentDateRange ? (
          <p>
            {/* ⚠️ THIS LINE IS HOW THE 2020 OUTLIER SURFACES. One real row sits at
                2020-12-04 against an otherwise-2026 range. It is NOT filtered out
                of any figure — every cutoff that would remove it is a judgement
                the data does not support — so the range is published instead, and
                a reader meets the odd date on their first visit. */}
            <span className="text-foreground">Send dates span</span> {sentDateRange.earliest} to{" "}
            {sentDateRange.latest}. Nothing outside that range has been filtered out; an unexpected
            date here means the sheet, not the chart.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Values printed exactly as stored — never re-cased, trimmed further, or grouped. */
function VerbatimList({ values }: { values: string[] }) {
  return (
    <>
      {values.map((value, i) => (
        <span key={value}>
          {i > 0 ? ", " : null}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
            {value}
          </code>
        </span>
      ))}
    </>
  );
}
