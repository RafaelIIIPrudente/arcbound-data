"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { LoginMark } from "./login-mark";

/**
 * The animated brand surface on the login screen — a WebGL fluid shader, tinted
 * to Arcbound and sitting on the warm paper base.
 *
 * ⚠️ THIS COMPONENT IS MOSTLY GUARD RAILS, AND THEY ARE THE POINT.
 *
 * `@react-three/fiber` + `three` is roughly 600KB of JavaScript. Login is the
 * coldest page in the app and the one page every user must get through, so the
 * shader is only ever allowed to load when all of the following hold:
 *
 *   1. The viewport is `lg` or wider — below that the brand panel is a text
 *      strip and the shader would never be seen, so nobody on a phone pays for
 *      it. A `hidden lg:block` wrapper would NOT achieve this: React still
 *      mounts the subtree and the chunk still downloads.
 *   2. The user has not asked for reduced motion.
 *   3. The client has hydrated — it is `ssr: false`, so `three` stays out of the
 *      server bundle entirely and the form is interactive first.
 *
 * When any of those fail it falls back to `LoginMark`, the static drawn series.
 * That is a real fallback, not a blank box: the panel looks deliberate either
 * way, which is what makes it safe to gate this aggressively.
 */
const RubberFluid = dynamic(() => import("@/components/react-bits/rubber-fluid"), {
  ssr: false,
  loading: () => null,
});

/** Arcbound red (#f63a3a) as the shader's 0–1 tint channels. */
const TINT = { r: 246 / 255, g: 58 / 255, b: 58 / 255 } as const;

/**
 * The dial to turn if this is too loud. The panel carries the wordmark, the
 * positioning line and the confidential notice on top of it, and text
 * legibility outranks the effect every time.
 *
 * Higher than the first attempt: against dark ink the pattern needs presence,
 * whereas against paper the same value washed out to a pale smear.
 */
const OPACITY = 0.5;

/**
 * Above the vendor default (1.0). This sits behind reading matter, so the
 * instinct is to slow it down — but 0.3 and then 0.8 both read as a still
 * image, which is the worst outcome: the full cost of a WebGL shader with none
 * of the effect. If it needs calming, this is the first dial.
 */
const SPEED = 1.4;

/**
 * Feature density. The vendor default (7.5) draws blobs nearly as large as the
 * panel, and motion you cannot TRACK reads as stillness however fast it runs —
 * which is why raising speed alone did not fix it. More, smaller forms give the
 * eye something to follow. Raise for busier, lower for calmer.
 */
const ZOOM = 11;

/**
 * True only once we have CONFIRMED the client both allows motion and is wide
 * enough to show the panel. Defaults to false so the expensive path is opt-in:
 * a reduced-motion user must never see a frame of animation before we check.
 */
function useShaderAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1024px)");
    const evaluate = () => setAllowed(!motion.matches && wide.matches);

    evaluate();
    motion.addEventListener("change", evaluate);
    wide.addEventListener("change", evaluate);
    return () => {
      motion.removeEventListener("change", evaluate);
      wide.removeEventListener("change", evaluate);
    };
  }, []);

  return allowed;
}

/**
 * `ink` is the panel's own background, passed in so the shader dissolves into
 * it instead of sitting on top as a visible rectangle. The panel owns that
 * colour — see login-brand-panel.tsx.
 */
export function LoginFluid({ ink }: { ink: string }) {
  const allowed = useShaderAllowed();

  if (!allowed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-12" aria-hidden>
        {/* `currentColor` on a panel whose foreground is near-white, so the
            static fallback reads as light bars on ink — same register as the
            shader it replaces. */}
        <LoginMark className="h-40 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0" aria-hidden>
      <RubberFluid
        className="h-full w-full"
        backgroundColor={ink}
        tintR={TINT.r}
        tintG={TINT.g}
        tintB={TINT.b}
        opacity={OPACITY}
        speed={SPEED}
        zoom={ZOOM}
        // Off deliberately: a login screen should not invite play, and pointer
        // tracking would re-render on every mouse move over the panel.
        cursorInteraction={false}
      />
    </div>
  );
}
