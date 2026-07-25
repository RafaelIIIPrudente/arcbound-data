import { cookies } from "next/headers";

import { env } from "@/env";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { paths } from "@/paths";
import type { BiPostRow } from "@/services/analytics";
import type {
  IssuedReportLink,
  PostAttributes,
  ReportLinkStatus,
  ResolveReportLink,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Report Links seam (real). The service face of public.report_links + its four
// SECURITY DEFINER functions (see supabase/report-links.sql). ArcBase holds NO
// service-role key: every privileged write and the public verify go through the
// definer RPCs, which enforce their own auth/lockout. The Access Code is never
// stored — only its bcrypt hash — and the raw code is returned ONCE, at
// issue/rotate.
//
// ⚠️ resolveReportLink FAILS CLOSED. It is the anonymous public gate, so any
// error — a broken read, or the SQL not yet applied — must DENY, never crash and
// never grant. issue/rotate/revoke are staff paths and surface their errors.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The absolute `/r/<token>` URL. Falls back to a host-relative path when no site
 * origin is configured (dev/test) — still a valid, copyable link on the host.
 */
function reportLinkUrl(token: string): string {
  const origin = env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "";
  return `${origin}${paths.reportLink(token)}`;
}

function mintedLink(data: unknown): IssuedReportLink {
  const { token, access_code } = (data ?? {}) as { token?: string; access_code?: string };
  if (typeof token !== "string" || typeof access_code !== "string") {
    throw new Error("Report link RPC returned an unexpected shape");
  }
  return { url: reportLinkUrl(token), accessCode: access_code };
}

/** Create the one active link for a Client. Errors if one is already active. */
export async function issueReportLink(clientId: string): Promise<IssuedReportLink> {
  const supabase = createServerClient(cookies());
  const { data, error } = await supabase.rpc("issue_report_link", { p_client_id: clientId });
  if (error) throw new Error(`Failed to issue report link: ${error.message}`);
  return mintedLink(data);
}

/** Revoke the active link and issue a fresh one. Returns the new URL + code. */
export async function rotateReportLink(clientId: string): Promise<IssuedReportLink> {
  const supabase = createServerClient(cookies());
  const { data, error } = await supabase.rpc("rotate_report_link", { p_client_id: clientId });
  if (error) throw new Error(`Failed to rotate report link: ${error.message}`);
  return mintedLink(data);
}

/** Deactivate the Client's active link (idempotent — a no-op when none active). */
export async function revokeReportLink(clientId: string): Promise<void> {
  const supabase = createServerClient(cookies());
  const { error } = await supabase.rpc("revoke_report_link", { p_client_id: clientId });
  if (error) throw new Error(`Failed to revoke report link: ${error.message}`);
}

/**
 * The staff-facing state of a Client's active link, or `null` when none exists /
 * the read failed.
 *
 * ⚠️ SELECTS METADATA ONLY — NEVER `access_code_hash`. The hash must never leave
 * the database through this seam; the raw code is unrecoverable by design.
 */
export async function getReportLink(clientId: string): Promise<ReportLinkStatus | null> {
  try {
    const supabase = createServerClient(cookies());
    const { data, error } = await supabase
      .from("report_links")
      .select("client_id, token, created_at, last_accessed_at")
      .eq("client_id", clientId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) {
      console.warn(`Failed to load report link for client ${clientId}: ${error.message}`);
      return null;
    }
    if (!data) return null;
    const row = data as {
      client_id: string;
      token: string;
      created_at: string;
      last_accessed_at: string | null;
    };
    return {
      clientId: row.client_id,
      url: reportLinkUrl(row.token),
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      active: true,
    };
  } catch (err) {
    console.warn(
      `Failed to load report link for client ${clientId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Verify an out-of-band Access Code against a Report Link token. THE PUBLIC GATE.
 *
 * ⚠️ FAILS CLOSED. Any RPC error, thrown exception, or malformed result maps to
 * `invalid` (deny) — never a crash, never a grant. `invalid` covers BOTH an
 * unknown/revoked token and a wrong code, so a bad URL and a bad code are
 * indistinguishable (no auth oracle). `locked` is the distinct rate-limit state.
 */
export async function resolveReportLink(token: string, code: string): Promise<ResolveReportLink> {
  try {
    const supabase = createServerClient(cookies());
    const { data, error } = await supabase.rpc("resolve_report_link", {
      p_token: token,
      p_code: code,
    });
    if (error) {
      console.warn(`resolve_report_link failed: ${error.message}`);
      return { ok: false, reason: "invalid" };
    }
    const result = (data ?? {}) as { status?: string; client_id?: string; read_grant?: string };
    // A success MUST carry both the clientId and the read grant. A grantless "ok"
    // is malformed → deny (never mint a session that cannot read anything).
    if (
      result.status === "ok" &&
      typeof result.client_id === "string" &&
      typeof result.read_grant === "string"
    ) {
      return { ok: true, clientId: result.client_id, readGrant: result.read_grant };
    }
    if (result.status === "locked") {
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "invalid" };
  } catch (err) {
    console.warn(`resolve_report_link threw: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, reason: "invalid" };
  }
}

/**
 * The report SOURCE for one Client, as returned by the token+grant-scoped public
 * read. `uploads` carries only what the report needs (freshness + follower
 * history); `posts`/`attributes` feed `buildClientReport`.
 */
export interface ReportLinkSource {
  clientId: string;
  clientName: string | null;
  posts: BiPostRow[];
  uploads: ReportLinkUpload[];
  attributes: PostAttributes[];
}

/** One upload row, reduced to the two facts the public report uses. */
export interface ReportLinkUpload {
  /** ISO 8601 — the ingest/scrape timestamp; drives freshness. */
  createdAt: string;
  /** Recorded follower count, or null when the upload carried none. */
  followerCount: number | null;
}

/**
 * Read the resolved Client's report source through the token + read grant. THE
 * PUBLIC DATA READ.
 *
 * ⚠️ FAILS CLOSED, AND THE GRANT IS THE SECOND FACTOR. The definer function
 * returns SQL null for ANY failure — unknown/revoked token, missing/wrong/expired
 * grant — which maps to `null` here (no data, no oracle). A token holder WITHOUT a
 * valid grant reads nothing. Any RPC error or throw also maps to `null`.
 */
export async function readReportLinkSource(
  token: string,
  grant: string,
): Promise<ReportLinkSource | null> {
  try {
    const supabase = createServerClient(cookies());
    const { data, error } = await supabase.rpc("report_link_read", {
      p_token: token,
      p_grant: grant,
    });
    if (error) {
      console.warn(`report_link_read failed: ${error.message}`);
      return null;
    }
    if (data == null) return null; // invalid/expired grant → denied (no oracle)
    const bundle = data as {
      client_id?: string;
      client_name?: string | null;
      posts?: BiPostRow[];
      uploads?: { created_at: string; follower_count: number | null }[];
      attributes?: PostAttributes[];
    };
    if (typeof bundle.client_id !== "string") return null;
    return {
      clientId: bundle.client_id,
      clientName: bundle.client_name ?? null,
      posts: bundle.posts ?? [],
      uploads: (bundle.uploads ?? []).map((u) => ({
        createdAt: u.created_at,
        followerCount: u.follower_count ?? null,
      })),
      attributes: bundle.attributes ?? [],
    };
  } catch (err) {
    console.warn(`report_link_read threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
