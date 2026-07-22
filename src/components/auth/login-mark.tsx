/**
 * The login screen's visual: a rising series of sharp bars, one in the accent.
 *
 * DRAWN IN CODE, not fetched. The CSP is nonce-based and would block an
 * external image, and a login screen should not depend on another host being
 * up. Inline SVG also means it is resolution-independent, weighs nothing, and
 * inherits `currentColor` — so it adapts to dark mode instead of needing a
 * second asset.
 *
 * It depicts what the product actually is: weekly post metrics accumulating
 * over time. That is the argument for it over stock photography — a picture of
 * a stranger at a laptop says nothing about ArcBase, and the starter template's
 * pastel gradient belongs to a different brand entirely.
 *
 * Decorative, so `aria-hidden`: the panel's text already says what this is, and
 * announcing "chart" to a screen reader on a login screen is noise.
 */

/**
 * Bar heights, 0–1. Deliberately NOT monotonic — a clean ramp reads as a logo,
 * and real metrics have bad weeks. The last bar is the accent.
 */
const BARS = [0.16, 0.24, 0.2, 0.33, 0.41, 0.36, 0.5, 0.62, 0.54, 0.71, 0.83, 1];

const BAR_WIDTH = 6;
const PITCH = 10;
const HEIGHT = 100;
const WIDTH = BARS.length * PITCH - (PITCH - BAR_WIDTH);

export function LoginMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${WIDTH} ${HEIGHT + 1}`}
      // Sharp corners, no radius: the brand is predominantly square.
      className={className}
      preserveAspectRatio="none"
    >
      {BARS.map((value, i) => {
        const isAccent = i === BARS.length - 1;
        return (
          <rect
            key={i}
            x={i * PITCH}
            y={HEIGHT - value * HEIGHT}
            width={BAR_WIDTH}
            height={value * HEIGHT}
            fill={isAccent ? "var(--primary)" : "currentColor"}
            // The series recedes as it goes back in time, so the eye lands on
            // the accent without it having to shout.
            opacity={isAccent ? 1 : 0.1 + (i / BARS.length) * 0.16}
          />
        );
      })}
      {/* Baseline — the only rule in the composition. */}
      <rect x={0} y={HEIGHT} width={WIDTH} height={1} fill="currentColor" opacity={0.18} />
    </svg>
  );
}
