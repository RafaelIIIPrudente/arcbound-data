"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import { decodeRange, encodeRange, toDayKey, triggerLabel } from "@/lib/date-range";
import { cn } from "@/lib/utils";

// ⚠️ LAZY, AND THE REASON IS THE PUBLIC ROUTE. `/r/[token]` — the report a
// CLIENT holds — renders this picker with `allowCustom={false}` and can never
// open a calendar. A static import would still ship react-day-picker in that
// route's bundle, making a client download a control that does not exist for
// them. The `import()` is what the bundler splits on, so the cost follows the
// capability.
//
// `ssr: false` because the calendar is only ever reached by clicking, so there
// is no first paint to server-render, and it keeps react-day-picker out of the
// server bundle too. Public props and behaviour are unchanged.
//
// next/dynamic rather than `React.lazy`: both split on the same `import()`, but
// React.lazy suspends to its fallback on the render that follows the click and
// only mounts a tick later — enough that a synchronous assertion right after
// the click sees no calendar. next/dynamic settles within the click's own flush.
const Calendar = dynamic(() => import("@/components/ui/calendar").then((m) => m.Calendar), {
  ssr: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SHARED RANGE CONTROL: presets down one side, a calendar beside them.
//
// One control, one concept. A Radix `Select` cannot host a calendar inside a
// `SelectItem`, and putting a second calendar BUTTON next to the existing Select
// would put two controls on screen that both answer "what window am I looking
// at?" — and they can visibly disagree.
//
// ⚠️ THIS COMPONENT MUST NOT NAVIGATE. `onSelect` is its only output. The two
// callers build URLs differently — `hrefFor` on the dashboard, `reportPeriodHref`
// on the report — and the second carries the rule that the param is ALWAYS
// written and never stripped, because an absent param legitimately means "no
// choice yet". A router in here would duplicate that rule badly and let the two
// surfaces drift.
//
// ⚠️ NOTHING ABOUT THE PRESETS IS HARD-CODED. The dashboard passes 7 / 30 / 90 +
// All time; the report passes All time / Years / Quarters / Months. They are
// opaque keys to this component: it renders them, and hands the chosen one back
// untouched.
// ─────────────────────────────────────────────────────────────────────────────

export interface DateRangePreset {
  /** The token this option means to its surface. Opaque here. */
  key: string;
  label: string;
  /** Optional heading. Presets without one render before any group. */
  group?: string;
}

export interface DateRangePickerProps {
  presets: DateRangePreset[];
  /** The token currently in the URL — a preset key, or a custom window. */
  value: string;
  /**
   * ⚠️ THE STAFF/CLIENT GATE, AND IT FAILS CLOSED. `/r/[token]` — the report a
   * CLIENT holds — renders this same component, and a custom window is a staff
   * affordance. Defaulting to `false` means a caller that forgets this prop
   * ships the narrower surface; defaulting to `true` would silently widen what
   * a client can reach.
   */
  allowCustom?: boolean;
  /** The ONLY output. The caller decides what URL, if any, this becomes. */
  onSelect: (token: string) => void;
  /** Injected, never `new Date()` — the same discipline the analytics seam uses. */
  today: Date;
  /**
   * Dialect for a custom token: `""` for the dashboard's `?range=`, `"custom:"`
   * for the report's `?period=`, where a bare window could collide with a named
   * period key. Used to READ `value` as well as to write what `onSelect` emits,
   * so the two cannot fall out of step.
   */
  customPrefix?: string;
  /** What the trigger is called. "LAST 30 DAYS" alone does not say what it controls. */
  ariaLabel?: string;
}

/** Tailwind's own `sm`, not a number invented here. */
const SM_BREAKPOINT_PX = 640;

/** Matches the existing mono/uppercase trigger on both surfaces. */
const TRIGGER = "w-auto gap-2 font-mono text-[11.5px] tracking-wide uppercase";

/** Local midnight of the calendar day `today` falls on — a DAY, not an instant. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function DateRangePicker({
  presets,
  value,
  allowCustom = false,
  onSelect,
  today,
  customPrefix = "",
  ariaLabel = "Date range",
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  // The first day of a window in progress. Held here rather than lifted, because
  // one click is not yet an answer and the surface has nothing to do with it.
  const [anchor, setAnchor] = React.useState<Date | undefined>(undefined);

  // ⚠️ FALSE UNTIL MEASURED, so the narrow layout has to be the safe default —
  // see use-media-query.ts. One month is that default.
  const twoUp = useMediaQuery(`(min-width: ${SM_BREAKPOINT_PX}px)`);

  // ⚠️ WARM THE LAZY CALENDAR AS SOON AS THIS SURFACE IS ALLOWED ONE. The import
  // above is split so `/r/[token]` never downloads react-day-picker; the cost
  // must follow the capability, not the click. But deferring the FETCH to the
  // click too would leave a staff user watching an empty popover on a cold
  // cache — and, in tests, would make the calendar's presence depend on
  // whichever earlier test happened to warm the module. Prefetching on mount
  // when `allowCustom` is true keeps the split (this never runs on the public
  // route) while making the calendar's arrival deterministic. It touches no
  // public prop and no rendered output.
  React.useEffect(() => {
    if (allowCustom) void import("@/components/ui/calendar");
  }, [allowCustom]);

  const todayLocal = startOfLocalDay(today);

  const selectedPreset = presets.find((p) => p.key === value);
  // Presets are matched first: on the report, "2026-07" is a named period, not
  // a window this module owns. `[]` because a preset's LENGTH is the surface's
  // business — here only the custom shape is being recognised.
  const custom = selectedPreset ? null : decodeRange(value, [], customPrefix);

  const label = selectedPreset
    ? selectedPreset.label
    : custom
      ? triggerLabel(custom, today)
      : // Neither a known preset nor a window we can read. Showing the raw token
        // states exactly what the URL says; falling back to a preset's label
        // would claim a selection nobody made.
        value;

  function close() {
    setAnchor(undefined);
    setOpen(false);
  }

  function choosePreset(key: string) {
    close();
    onSelect(key);
  }

  function chooseDay(clicked: Date) {
    // ⚠️ RESTART, NEVER INVERT. A second pick before the first becomes the new
    // anchor. Swapping the ends would answer a question the user did not ask,
    // and `decodeRange` rejects a backwards token anyway.
    if (anchor === undefined || clicked.getTime() < anchor.getTime()) {
      setAnchor(clicked);
      return;
    }
    close();
    onSelect(
      encodeRange(
        // toDayKey reads LOCAL parts: the day tapped, not the instant behind it.
        { kind: "custom", startDay: toDayKey(anchor), endDay: toDayKey(clicked) },
        customPrefix,
      ),
    );
  }

  const ungrouped = presets.filter((p) => p.group === undefined);
  const groups = [...new Set(presets.map((p) => p.group).filter((g) => g !== undefined))];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Dismissing mid-selection drops the half-made window rather than
        // holding an anchor the user can no longer see.
        if (!next) setAnchor(undefined);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={TRIGGER} aria-label={ariaLabel}>
          {label}
          <CalendarIcon className="size-3.5 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-auto p-0", allowCustom && "sm:flex sm:divide-x")}
      >
        <div
          className={cn(
            "flex flex-col gap-0.5 p-2",
            allowCustom && "max-h-64 overflow-y-auto sm:max-h-none",
          )}
        >
          {ungrouped.map((p) => (
            <PresetButton
              key={p.key}
              preset={p}
              active={p.key === value}
              onClick={() => choosePreset(p.key)}
            />
          ))}
          {groups.map((group) => (
            <div key={group} className="flex flex-col gap-0.5">
              <div
                data-preset-group
                className="px-2 pt-2 pb-1 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
              >
                {group}
              </div>
              {presets
                .filter((p) => p.group === group)
                .map((p) => (
                  <PresetButton
                    key={p.key}
                    preset={p}
                    active={p.key === value}
                    onClick={() => choosePreset(p.key)}
                  />
                ))}
            </div>
          ))}
        </div>

        {allowCustom ? (
          <Calendar
            mode="range"
            // Two side by side do not fit on a phone (PR #11).
            numberOfMonths={twoUp ? 2 : 1}
            // Open on the month containing today; with two months, today sits on
            // the right so the pair reads backwards into history rather than
            // forwards into a month that is entirely disabled.
            defaultMonth={
              twoUp ? new Date(todayLocal.getFullYear(), todayLocal.getMonth() - 1, 1) : todayLocal
            }
            // The injected clock, so "today" is highlighted deterministically.
            today={todayLocal}
            // ⚠️ TODAY IS A PRINCIPLED BOUNDARY, NOT A TUNING KNOB. No post exists
            // in the future, and an end date beyond today would silently pad the
            // window and shift the prior baseline by the same amount. There is
            // deliberately NO maximum span beside it — that WOULD be invented.
            endMonth={todayLocal}
            disabled={{ after: todayLocal }}
            selected={anchor ? { from: anchor, to: undefined } : undefined}
            // The computed range is ignored in favour of the day actually
            // clicked: the two-click rule lives in `chooseDay`, not in the
            // calendar's own idea of how a range grows.
            onSelect={(_range, clicked) => chooseDay(clicked)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PresetButton({
  preset,
  active,
  onClick,
}: {
  preset: DateRangePreset;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-preset-key={preset.key}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-sm px-2 py-1.5 text-left text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent font-medium text-accent-foreground",
      )}
    >
      {preset.label}
    </button>
  );
}
