import type { Metadata } from "next";

import { PublicReport } from "@/components/report-link/public-report";
import { getGateClientId } from "@/lib/report-link-session";

import { ReportLinkGate } from "./gate";

// ⚠️ NOINDEX + NO-REFERRER, on the route. A tokenized private report must never
// be indexed, and its URL (which carries the capability token) must never leak in
// a Referer header to anything the client clicks through to. `title.absolute`
// drops the "| ArcBase" template so the tab does not name the internal product.
export const metadata: Metadata = {
  title: { absolute: "Private report" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The public client Report Link route.
 *
 * Fails closed: `getGateClientId` returns the authorised clientId ONLY for a
 * valid, unexpired, correctly-signed gate cookie bound to THIS token (see
 * report-link-session). Anything else — no cookie, a cookie for another token, a
 * tampered/expired one, or a missing signing secret — yields `null`, and the
 * Access Code gate is shown. The clientId comes from the cookie, never from the
 * URL, so a visitor can only ever see the one Client they unlocked.
 */
export default async function ReportLinkRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ token }, { period }] = await Promise.all([params, searchParams]);

  const clientId = await getGateClientId(token);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      {clientId === null ? (
        <ReportLinkGate token={token} />
      ) : (
        // The gate cookie proves the token; PublicReport fetches THIS client's
        // report source through the token + read grant (no service-role key, no
        // authenticated table read of any kind). The clientId decision above only gates
        // view-vs-gate; the data read re-checks the grant server-side.
        <PublicReport token={token} period={period} />
      )}
    </main>
  );
}
