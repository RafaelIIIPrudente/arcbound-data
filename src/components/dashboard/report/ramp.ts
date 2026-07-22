/**
 * A SINGLE-HUE SEQUENTIAL RAMP keyed to RANK — not one arbitrary colour per
 * category.
 *
 * globals.css defines only --chart-1..5, and defines them differently for light
 * and dark, so a per-category rainbow could neither cover the ten asset types
 * nor be reproduced accessibly in both themes — and it would carry no meaning.
 * Here the ramp encodes magnitude, which the descending rank already implies.
 */
export function rampColor(rank: number, total: number): string {
  const step = total > 1 ? rank / (total - 1) : 0;
  return `color-mix(in oklab, var(--primary) ${Math.round(100 - step * 60)}%, transparent)`;
}
