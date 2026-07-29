import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useMediaQuery } from "./use-media-query";

interface FakeMql {
  media: string;
  matches: boolean;
  listeners: Set<() => void>;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
}

let mqls: FakeMql[] = [];
let matching: (query: string) => boolean;

/** jsdom implements no `matchMedia` at all — the same gap login/page.test.tsx fills. */
beforeEach(() => {
  mqls = [];
  matching = () => false;
  window.matchMedia = ((query: string) => {
    const mql: FakeMql = {
      media: query,
      get matches() {
        return matching(query);
      },
      listeners: new Set<() => void>(),
      addEventListener: (_type, cb) => {
        mql.listeners.add(cb);
      },
      removeEventListener: (_type, cb) => {
        mql.listeners.delete(cb);
      },
    };
    mqls.push(mql);
    return mql;
  }) as unknown as typeof window.matchMedia;
});

/** Move the viewport across the query and notify every subscriber, as a browser would. */
function setViewport(query: string, value: boolean) {
  matching = (q) => q === query && value;
  act(() => {
    for (const mql of mqls) if (mql.media === query) for (const cb of mql.listeners) cb();
  });
}

const SM = "(min-width: 640px)";

describe("useMediaQuery", () => {
  it("reports whether the query matches", () => {
    matching = () => true;
    expect(renderHook(() => useMediaQuery(SM)).result.current).toBe(true);
  });

  it("reports false when it does not match", () => {
    expect(renderHook(() => useMediaQuery(SM)).result.current).toBe(false);
  });

  it("asks the browser for the EXACT query it was given", () => {
    renderHook(() => useMediaQuery(SM));
    expect(mqls.map((m) => m.media)).toEqual([SM]);
  });

  it("STARTS FALSE even when the query already matches", () => {
    // ⚠️ THE HYDRATION RULE. There is no viewport on the server, so the first
    // client render must agree with what the server produced — false, the
    // narrow layout. Reading matchMedia during render instead would make the
    // server and the client disagree on the very first paint.
    matching = () => true;
    const seen: boolean[] = [];

    renderHook(() => {
      const value = useMediaQuery(SM);
      seen.push(value);
      return value;
    });

    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true);
  });

  it("re-reports when the viewport crosses the breakpoint, in both directions", () => {
    const { result } = renderHook(() => useMediaQuery(SM));
    expect(result.current).toBe(false);

    setViewport(SM, true);
    expect(result.current).toBe(true);

    setViewport(SM, false);
    expect(result.current).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useMediaQuery(SM));
    expect(mqls[0]!.listeners.size).toBe(1);

    unmount();

    expect(mqls[0]!.listeners.size).toBe(0);
  });
});
