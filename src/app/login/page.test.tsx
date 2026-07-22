import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    push: vi.fn(),
    refresh: vi.fn(),
    error: vi.fn(),
    configured: false,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/config", () => ({
  get isSupabaseConfigured() {
    return mocks.configured;
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword: vi.fn() } }),
}));

import LoginPage from "./page";

/**
 * jsdom implements no `matchMedia`, and the brand panel gates its WebGL shader
 * on two media queries. Defaulted to REDUCED MOTION so the suite always
 * exercises the static fallback: the shader path needs a real GL context, which
 * jsdom cannot provide, and mounting `three` here would fail for reasons that
 * have nothing to do with the assertion under test.
 */
const media = { reducedMotion: true, wide: true };

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? media.reducedMotion : media.wide,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  media.reducedMotion = true;
  media.wide = true;
  mocks.push.mockClear();
  mocks.refresh.mockClear();
  mocks.error.mockClear();
  mocks.configured = false;
});

// ── WCAG contrast, computed rather than asserted from memory ─────────────────
// The brief's warning is real: the app's greys were chosen against pure white,
// and #F4F3F0 is darker, so every ramp value has to be re-checked against the
// surface it actually sits on.

/** sRGB channel → linear, per WCAG 2.x. */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Flatten a translucent ink onto an opaque surface — rgba text is not a colour. */
function over(
  ink: [number, number, number],
  alpha: number,
  bg: [number, number, number],
): [number, number, number] {
  return [0, 1, 2].map((i) => alpha * ink[i]! + (1 - alpha) * bg[i]!) as [number, number, number];
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (a + 0.05) / (b + 0.05);
}

const PAPER: [number, number, number] = [244, 243, 240]; // #F4F3F0
const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [26, 26, 26]; // #1A1A1A

describe("contrast on the warm base", () => {
  it("clears AA for primary ink on paper and on the card", () => {
    expect(contrast(INK, PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(INK, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("clears AA for the muted ramp value used for secondary text", () => {
    // rgba(26,26,26,.74) — the value the page scopes --muted-foreground to.
    // It has to hold on BOTH surfaces: the notice sits on paper, the field
    // labels sit on the white card.
    expect(contrast(over(INK, 0.74, PAPER), PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over(INK, 0.74, WHITE), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("clears AA for every piece of type on the dark brand panel", () => {
    // The panel is pinned to ink in BOTH themes, so its text is inverted for
    // that panel only. These are the three things sitting on it. The first
    // version inherited the page's dark `--muted-foreground` onto a LIGHT
    // shader, which is how "by Arcbound" and the confidential notice ended up
    // invisible — so this is a regression guard, not a formality.
    const INK: [number, number, number] = [20, 18, 16]; // #141210
    const PANEL_FG: [number, number, number] = [250, 249, 247]; // #faf9f7
    const ACCENT: [number, number, number] = [246, 58, 58]; // #f63a3a — "Base"

    expect(contrast(PANEL_FG, INK)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over(PANEL_FG, 0.72, INK), INK)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ACCENT, INK)).toBeGreaterThanOrEqual(4.5);
  });

  it("would have FAILED with the page's dark muted text on that panel", () => {
    // Guard the guard, and a record of the actual bug: the app's light-mode
    // muted ink on the old near-white shader panel is what shipped, and it is
    // nowhere near AA against the ink the panel now uses.
    const INK: [number, number, number] = [20, 18, 16];
    expect(contrast(over(INK, 0.74, INK), INK)).toBeLessThan(4.5);
  });

  it("shows why a lighter ramp step was NOT used for body text", () => {
    // Guard the guard: proves these assertions can fail. Arcbound's palette has
    // no step below .74 for text, and anything appreciably lighter drops under
    // AA on paper — which is exactly the trap of reusing white-tuned greys.
    expect(contrast(over(INK, 0.45, PAPER), PAPER)).toBeLessThan(4.5);
  });
});

describe("the app's warm base tokens", () => {
  // The base now lives in globals.css and applies app-wide, so it is asserted
  // against the STYLESHEET rather than this page's className — the page just
  // paints `bg-background` and inherits.
  const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const root = globals.slice(globals.indexOf(":root {"), globals.indexOf(".dark {"));

  it("sets the page to warm paper and card surfaces to white", () => {
    expect(root).toMatch(/--background:\s*#f4f3f0/i);
    expect(root).toMatch(/--card:\s*#ffffff/i);
    expect(root).toMatch(/--popover:\s*#ffffff/i);
  });

  it("moves --muted-foreground off the white-tuned grey", () => {
    // THE LOAD-BEARING ASSERTION. oklch(0.556 0 0) measures 4.26:1 on #F4F3F0
    // and is used in 143 places; leaving it while darkening the page would put
    // the whole app under AA at once. The contrast block above proves the
    // replacement clears it on both paper and card.
    expect(root).toMatch(/--muted-foreground:\s*rgba\(26,\s*26,\s*26,\s*0?\.74\)/);
    expect(root).not.toMatch(/--muted-foreground:\s*oklch\(0\.556/);
  });

  it("leaves the accent alone", () => {
    // #f63a3a is already Arcbound's red. The palette was reference for
    // surfaces, not licence to recolour the product.
    expect(root).toMatch(/--primary:\s*#f63a3a/i);
    expect(root).toMatch(/--ring:\s*#f63a3a/i);
  });

  it("keeps subtle surfaces BELOW the paper, not above it", () => {
    // At oklch(0.97) these were lighter than #F4F3F0, so every hover would have
    // read as a highlight instead of a recess.
    expect(root).toMatch(/--muted:\s*#eae8e3/i);
    expect(root).toMatch(/--accent:\s*#eae8e3/i);
  });

  it("does not touch dark mode, which already recesses the page", () => {
    const dark = globals.slice(globals.indexOf(".dark {"));
    expect(dark).toMatch(/--background:\s*oklch\(0\.145 0 0\)/);
    expect(dark).toMatch(/--card:\s*oklch\(0\.205 0 0\)/);
  });
});

describe("the login page layout", () => {
  it("places the form BEFORE the brand panel in the DOM", () => {
    const { container } = render(<LoginPage />);
    const sections = [...container.querySelectorAll("section")];

    // A phone should land on the fields, not scroll past branding to reach
    // them. Desktop moves the brand to the left with grid placement, so the
    // reading order stays this way at every width.
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections[0]!.contains(screen.getByLabelText("Email"))).toBe(true);
    expect(sections[1]!.textContent).toContain("Confidential · Arcbound internal");
  });

  it("puts the confidential notice IN the layout, not pinned to the viewport", () => {
    render(<LoginPage />);
    const notice = screen.getByText("Confidential · Arcbound internal");

    // It used to be `absolute inset-x-0 bottom-6`, floating free of everything.
    expect(notice.className).not.toContain("absolute");
    expect(notice.closest("section")).not.toBeNull();
  });

  it("identifies the product at every width", () => {
    render(<LoginPage />);

    // Two lockups by design — one rides above the form below `lg`, where the
    // brand panel is text-only. Both must be present in the markup.
    expect(screen.getAllByText("Arc").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/by Arcbound/).length).toBeGreaterThan(0);
  });

  it("references no external asset", () => {
    const { container } = render(<LoginPage />);

    // The CSP is nonce-based and would block one, and it would couple this page
    // to the marketing site's uptime. The visual is drawn inline instead.
    for (const el of container.querySelectorAll("[src], [href]")) {
      const url = el.getAttribute("src") ?? el.getAttribute("href") ?? "";
      expect(url).not.toMatch(/^https?:\/\//);
    }
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to the static mark when the user prefers reduced motion", () => {
    media.reducedMotion = true;
    const { container } = render(<LoginPage />);

    // No WebGL canvas, and the panel still looks deliberate rather than blank —
    // which is what makes it safe to gate the shader as aggressively as
    // login-fluid.tsx does.
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("does not mount the shader on a narrow viewport", () => {
    // Below `lg` the panel is a text strip, so a phone must not download ~600KB
    // of three.js for something it will never see. A `hidden lg:block` wrapper
    // alone would not prevent this — React still mounts the subtree.
    media.reducedMotion = false;
    media.wide = false;
    const { container } = render(<LoginPage />);

    expect(container.querySelector("canvas")).toBeNull();
  });

  it("draws its visual inline, and hides it from assistive tech", () => {
    const { container } = render(<LoginPage />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    // Decorative: the panel's text already says what this is, and announcing a
    // chart on a login screen is noise.
    expect(svg).toHaveAttribute("aria-hidden");
    // One bar in the accent, the rest in inherited ink — so it adapts to dark
    // mode rather than needing a second asset.
    const fills = [...svg!.querySelectorAll("rect")].map((r) => r.getAttribute("fill"));
    expect(fills.filter((f) => f === "var(--primary)")).toHaveLength(1);
    expect(fills.filter((f) => f === "currentColor").length).toBeGreaterThan(1);
  });
});

describe("the sign-in form still works", () => {
  it("gives every field a real associated label", () => {
    render(<LoginPage />);

    // getByLabelText resolves through htmlFor/id — restyling FormLabel must not
    // have reduced it to decorative text.
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("keeps an enabled submit button", () => {
    render(<LoginPage />);
    const submit = screen.getByRole("button", { name: /sign in/i });

    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeEnabled();
  });

  it("still validates before attempting to sign in", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // Submitted EMPTY on purpose. A malformed email never reaches zod: the
    // field is `type="email"`, so the browser's own constraint validation
    // blocks submission first and react-hook-form is never invoked — verified
    // in jsdom, where the submit event simply does not fire. Empty fields carry
    // no `required` attribute, so they pass native validation and land on the
    // resolver, which is the layer this test exists to pin.
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Password is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("still toasts the configuration message when Supabase is unconfigured", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "staff@arcbound.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await vi.waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Authentication isn't configured — set your Supabase environment variables.",
      ),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
