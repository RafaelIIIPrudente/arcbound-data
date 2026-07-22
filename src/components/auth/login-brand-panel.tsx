import { Wordmark } from "@/components/brand/wordmark";

import { LoginFluid } from "./login-fluid";

/**
 * The brand side of the login screen: a red fluid surface on dark ink, with the
 * wordmark, a short positioning line and the confidential notice over it.
 *
 * ⚠️ THIS PANEL IS DARK IN BOTH THEMES, AND THAT IS THE FIX.
 *
 * The first version handed the shader the app's warm paper background, so it
 * inherited the page's theme. Three things broke at once:
 *
 *   1. In dark mode a LIGHT panel sat beside a near-black form — two unrelated
 *      halves rather than one screen.
 *   2. The shader mixes its tint INTO its background, so red into near-white
 *      came out salmon pink. The brand accent simply vanished.
 *   3. The panel's text used the page's `--muted-foreground`, which is dark ink
 *      — illegible on a light shader. "by Arcbound" and the confidential notice
 *      were effectively invisible.
 *
 * Pinning the panel to ink solves all three: the red reads as red against it,
 * the text has ONE predictable ground in either theme, and the split reads as a
 * deliberate dark-brand / light-form pattern instead of a theme bug. In light
 * mode it sits against warm paper; in dark, slightly raised from the page.
 */

/**
 * Warm near-black — a hair off neutral so it belongs to the paper family rather
 * than reading as a generic dark UI. Also lighter than the app's dark
 * background (#0a0a0a), so in dark mode the panel is raised, not merged.
 */
const PANEL_INK = "#141210";

export function LoginBrandPanel() {
  return (
    <section
      // Text tokens are inverted FOR THIS PANEL ONLY. Everything inside sits on
      // ink in both themes, so it needs light type regardless of the page theme.
      // Measured on #141210: foreground 17.8:1, muted 9.5:1, the wordmark's red
      // 5.0:1 — all clear of AA, and asserted in src/app/login/page.test.tsx.
      style={{ backgroundColor: PANEL_INK }}
      className="relative overflow-hidden text-foreground [--foreground:#faf9f7] [--muted-foreground:rgba(250,249,247,0.72)] lg:col-start-1 lg:row-start-1"
    >
      {/* Decorative, aria-hidden, and pointer-events-none so it can never
          intercept a click meant for the form beside it. */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block">
        <LoginFluid ink={PANEL_INK} />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between gap-10 px-6 py-8 lg:px-12 lg:py-14">
        <div className="hidden lg:block">
          <Wordmark className="text-3xl" />
          <div className="mt-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            by Arcbound
          </div>
        </div>

        {/* Internal-tool voice: what the thing does, for people who already work
            here. Marketing copy would read as absurd on a staff login. */}
        <p className="hidden max-w-md font-display text-2xl leading-snug font-semibold tracking-tight text-balance lg:block">
          Weekly LinkedIn post metrics for Arcbound clients — ingested, attributed and reported.
        </p>

        {/* In the layout, not pinned to the viewport edge. It used to be
            absolutely positioned at the bottom of the screen. */}
        <div className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
          Confidential · Arcbound internal
        </div>
      </div>
    </section>
  );
}
