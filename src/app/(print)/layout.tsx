import { redirect } from "next/navigation";

import { authDisabled } from "@/config";
import { getSession } from "@/lib/auth/session";
import { paths } from "@/paths";

import "./print.css";

/**
 * The print shell: no sidebar, no top bar, no theme toggle — nothing that would
 * end up on paper or in a client's hands.
 *
 * `(print)` is a route GROUP, so it contributes nothing to the URL. The pages
 * under it are auth-gated by the same default-deny middleware rule as every
 * other route (see lib/route-access, and its test); this layout re-checks the
 * session for the same defence-in-depth reason the app shell does.
 *
 * `.print-root` forces the light palette — see print.css for why that has to
 * happen in CSS rather than through next-themes.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!authDisabled && !user) redirect(paths.login);

  // Width, centring and padding all come from `.print-root` in print.css, so
  // the document's geometry lives beside the @page rule it has to agree with.
  return <div className="print-root">{children}</div>;
}
