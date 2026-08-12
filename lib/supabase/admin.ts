import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES ALL RLS — never import it into a
 * client component or a `NEXT_PUBLIC_*` context. Two kinds of server-side
 * call sites are legitimate: (1) code with no signed-in user (the scheduled
 * report cron), and (2) a signed-in admin's Server Action doing something RLS
 * itself can't express (e.g. runRetentionPurge in settings/actions.ts) — that
 * caller must re-derive its own org/role scoping (`.eq("org_id", ...)`) by
 * hand, since there's no RLS safety net once this client is in play.
 *
 * Throws rather than returning a broken client, so a missing key fails loudly
 * at the call site instead of silently returning empty result sets.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — scheduled reports cannot read data without it.",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
