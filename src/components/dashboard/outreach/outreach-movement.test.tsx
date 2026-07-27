import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OutreachMovement, OutreachMovementState } from "@/services/types";

import { OutreachMovementPanel } from "./outreach-movement";

const MOVEMENT: OutreachMovement = {
  steps: [
    { label: "Requests sent", source: "Date Sent", previous: 1412, current: 1435, delta: 23 },
    {
      label: "Connections accepted",
      source: "Connection Status",
      previous: 198,
      current: 217,
      delta: 19,
    },
    { label: "Replied", source: "Reply Status", previous: 44, current: 39, delta: -5 },
    {
      label: "Meetings booked",
      source: "Meeting Booked (date)",
      previous: 8,
      current: 8,
      delta: 0,
    },
  ],
  prospects: { previous: 1412, current: 1435, delta: 23 },
};

const OK: OutreachMovementState = {
  status: "ok",
  movement: MOVEMENT,
  previousAt: "2026-07-20T09:00:00.000Z",
  currentAt: "2026-07-27T09:00:00.000Z",
};

/** Every step row, as `label previous current delta` text. */
function stepRows(container: HTMLElement): string[][] {
  return [...container.querySelectorAll("[data-movement-step]")].map((row) =>
    ["label", "source", "previous", "current", "delta"].map(
      (part) => row.querySelector(`[data-step-${part}]`)?.textContent?.trim() ?? "",
    ),
  );
}

describe("OutreachMovementPanel — FOUR WAYS THERE IS NOTHING TO COMPARE, KEPT APART", () => {
  it("ONE SNAPSHOT: says so, and shows NO FIGURES AT ALL", () => {
    // ⚠️ THE COMMON CASE TODAY AND THE EASIEST TO GET WRONG. A zeroed panel would
    // assert that nothing changed between two snapshots, when the truth is that
    // there is no second snapshot to change against. Not a number on the screen.
    const { container } = render(<OutreachMovementPanel state={{ status: "single" }} />);

    expect(screen.getByText(/nothing to compare yet/i)).toBeInTheDocument();
    expect(screen.getByText(/upload .* again/i)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\d/);
    expect(container.querySelector("[data-movement-step]")).toBeNull();
  });

  it("HISTORY UNREADABLE: reads differently from having one snapshot", () => {
    const single = render(<OutreachMovementPanel state={{ status: "single" }} />).container
      .textContent;
    const { container } = render(
      <OutreachMovementPanel state={{ status: "history-unavailable" }} />,
    );

    expect(screen.getByText(/could not read.*upload history/i)).toBeInTheDocument();
    // Two different facts, two different sentences.
    expect(container.textContent).not.toBe(single);
    expect(container.textContent ?? "").not.toMatch(/\d/);
  });

  it("PREVIOUS SNAPSHOT UNREADABLE: names the snapshot it could not read", () => {
    render(
      <OutreachMovementPanel
        state={{ status: "previous-unavailable", previousAt: "2026-07-20T09:00:00.000Z" }}
      />,
    );

    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    // The date is the whole point: it says WHICH snapshot is missing.
    expect(screen.getByText(/Jul 20, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/nothing to compare yet/i)).not.toBeInTheDocument();
  });

  it("PARTIAL READ: refuses to subtract a floor from a total", () => {
    // ⚠️ A TRUNCATED SNAPSHOT SHORT BY 435 ROWS WOULD READ AS "−435 REQUESTS
    // SENT" — movement nobody made. No delta is shown at all.
    const { container } = render(<OutreachMovementPanel state={{ status: "partial-read" }} />);

    expect(screen.getByText(/read only in part/i)).toBeInTheDocument();
    expect(container.querySelector("[data-movement-step]")).toBeNull();
  });

  it("gives each of the four a DISTINCT rendering", () => {
    const texts = (
      [
        { status: "single" },
        { status: "history-unavailable" },
        { status: "previous-unavailable", previousAt: "2026-07-20T09:00:00.000Z" },
        { status: "partial-read" },
      ] as OutreachMovementState[]
    ).map((state) => render(<OutreachMovementPanel state={state} />).container.textContent);

    expect(new Set(texts).size).toBe(4);
  });
});

describe("OutreachMovementPanel — two snapshots", () => {
  it("shows previous → current and the difference, per step, with its source column", () => {
    const { container } = render(<OutreachMovementPanel state={OK} />);

    expect(stepRows(container)).toEqual([
      ["Requests sent", "Date Sent", "1,412", "1,435", "+23"],
      ["Connections accepted", "Connection Status", "198", "217", "+19"],
      ["Replied", "Reply Status", "44", "39", "-5"],
      ["Meetings booked", "Meeting Booked (date)", "8", "8", "0"],
    ]);
  });

  it("names BOTH DATES being compared", () => {
    render(<OutreachMovementPanel state={OK} />);

    expect(screen.getByText(/Jul 20, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Jul 27, 2026/)).toBeInTheDocument();
  });

  it("reports the PROSPECT-COUNT movement — the number that explains most deltas", () => {
    render(<OutreachMovementPanel state={OK} />);
    // `[\s\S]*` rather than the `s` flag: the repo's tsc target predates it.
    expect(screen.getByTestId("movement-prospects").textContent).toMatch(
      /1,412[\s\S]*1,435[\s\S]*\+23/,
    );
  });
});

describe("OutreachMovementPanel — A NEGATIVE DELTA IS STATED, NEVER JUDGED", () => {
  it("prints the drop as a signed number and nothing more", () => {
    const { container } = render(<OutreachMovementPanel state={OK} />);
    const replied = [...container.querySelectorAll("[data-movement-step]")].find((row) =>
      /Replied/.test(row.querySelector("[data-step-label]")?.textContent ?? ""),
    );

    expect(replied?.querySelector("[data-step-delta]")?.textContent).toBe("-5");
  });

  it("uses NO VERDICT LANGUAGE anywhere — in either direction", () => {
    const { container } = render(<OutreachMovementPanel state={OK} />);

    expect(container.textContent ?? "").not.toMatch(
      /declin|regress|worse|improv|better|gain|loss|lost|fail|success|healthy|concern|good|bad|strong|weak/i,
    );
  });

  it("carries NO COLOUR VERDICT — a drop is not red and a rise is not green", () => {
    // ⚠️ COLOUR IS THE VERDICT THAT SLIPS PAST A COPY REVIEW. A drop can mean the
    // SHEET shrank rather than that anyone un-replied; painting it destructive
    // asserts a cause ArcBase cannot see.
    const { container } = render(<OutreachMovementPanel state={OK} />);
    const classes = [...container.querySelectorAll("*")]
      .map((el) => el.getAttribute("class") ?? "")
      .join(" ");

    expect(classes).not.toMatch(/destructive|red-|green-|emerald|rose-|amber-/);
  });

  it("uses no directional arrow that reads as failure", () => {
    const { container } = render(<OutreachMovementPanel state={OK} />);
    expect(container.textContent ?? "").not.toMatch(/▼|▲|↓|↑/);
  });

  it("STATES BOTH READINGS of a change — the outreach, or the sheet", () => {
    render(<OutreachMovementPanel state={OK} />);

    // The sentence that stops a reader concluding a cause the data cannot show.
    expect(screen.getByText(/replaces the whole export/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot tell/i)).toBeInTheDocument();
  });

  it("computes NO RATE, PERCENTAGE OR SHARE from the two counts", () => {
    const { container } = render(<OutreachMovementPanel state={OK} />);

    expect(container.textContent ?? "").not.toMatch(
      /%|percent|rate|score|rank|grade|benchmark|target|growth/i,
    );
  });
});
