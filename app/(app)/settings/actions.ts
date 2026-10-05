"use server";

import { redirect } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurgeCandidates } from "@/lib/retention";
import { cleanName, needsName } from "@/lib/names";
import {
  boolText,
  nameField,
  parseFields,
  roleField,
  shortText,
  statusField,
  uuidField,
} from "@/lib/validate";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

async function logAudit(
  supabase: SupabaseClient,
  orgId: string,
  actorId: string,
  action: string,
  table: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
) {
  await supabase.from("audit_log").insert({
    org_id: orgId,
    actor_id: actorId,
    action,
    entity_table: table,
    entity_id: entityId,
    before: before ?? null,
    after: after ?? null,
  });
}

async function requireAdmin() {
  const ctx = await requireAppContext();
  if (ctx.role !== "admin") return null;
  return ctx;
}

// ---------------------------------------------------------------------
// Org branding (0020). orgs only ever had a read policy before this —
// these are the first writes to it that aren't the service-role client.
// ---------------------------------------------------------------------
export async function renameOrg(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const input = parseFields(formData, { name: nameField });
  if (!input) return;
  const name = input.name;

  const supabase = await createClient();
  const admin = createAdminClient();
  const { error } = await admin.from("orgs").update({ name }).eq("id", ctx.orgId);
  if (error) return;

  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "orgs", ctx.orgId, { name: ctx.orgName }, { name });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

// Raster formats only. SVG is excluded because it can carry script.
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

// Decide the type from the file's first bytes, not the name or the type the
// browser declared. Returns null for anything that isn't a PNG, JPEG or WebP.
async function sniffLogoType(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head[0] === 0x89 && text(1, 4) === "PNG") return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  return null;
}

const LOGO_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function uploadOrgLogo(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > LOGO_MAX_BYTES) return;
  const realType = await sniffLogoType(file);
  if (!realType || !LOGO_TYPES.has(realType)) return;

  const ext = LOGO_EXT[realType];
  const path = `${ctx.orgId}/logo.${ext}`;

  const supabase = await createClient();
  const admin = createAdminClient();
  await admin.storage.createBucket("org-logos", {
    public: true,
    fileSizeLimit: LOGO_MAX_BYTES,
    allowedMimeTypes: [...LOGO_TYPES],
  });

  const { error: uploadError } = await admin.storage
    .from("org-logos")
    .upload(path, file, { upsert: true, contentType: realType });
  if (uploadError) return;

  // Cache-bust so a replaced logo shows immediately instead of the old
  // cached image at the same URL.
  const { data: pub } = admin.storage.from("org-logos").getPublicUrl(path);
  const logoUrl = `${pub.publicUrl}?v=${Date.now()}`;

  await admin.from("orgs").update({ logo_url: logoUrl }).eq("id", ctx.orgId);

  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "orgs", ctx.orgId, null, { logo_url: logoUrl });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function updateMemberRole(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const input = parseFields(formData, { membershipId: uuidField, role: roleField });
  if (!input) return;
  const { membershipId, role } = input;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("memberships")
    .select("role")
    .eq("id", membershipId)
    .maybeSingle();
  await supabase.from("memberships").update({ role }).eq("id", membershipId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "memberships", membershipId, before, { role });

  revalidatePath("/settings");
}

export async function setMemberStatus(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const input = parseFields(formData, { membershipId: uuidField, status: statusField });
  if (!input) return;
  const { membershipId, status } = input;

  const supabase = await createClient();
  await supabase.from("memberships").update({ status }).eq("id", membershipId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "memberships", membershipId, null, { status });

  revalidatePath("/settings");
}

export async function updateMemberName(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const input = parseFields(formData, { membershipId: uuidField, name: nameField });
  if (!input) return;
  const { membershipId } = input;
  const name = cleanName(input.name);
  if (!name) return;

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id, profiles(full_name)")
    .eq("id", membershipId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!membership) return;

  const profile = membership.profiles as unknown as { full_name: string | null } | null;
  const admin = createAdminClient();
  await admin.from("profiles").update({ full_name: name }).eq("id", membership.user_id);
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "profiles", membership.user_id, { full_name: profile?.full_name ?? null }, { full_name: name });

  revalidatePath("/settings");
}

export async function addSite(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const input = parseFields(formData, { name: shortText });
  if (!input) return;
  const name = input.name;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sites")
    .insert({ org_id: ctx.orgId, name })
    .select("id")
    .single();
  if (error) return; // don't audit a creation that didn't happen
  await logAudit(supabase, ctx.orgId, ctx.userId, "create", "sites", data?.id ?? null, null, { name });

  revalidatePath("/settings");
}

export async function addTerm(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const input = parseFields(formData, { name: shortText });
  if (!input) return;
  const name = input.name;
  const startsOn = String(formData.get("startsOn") ?? "") || null;
  const endsOn = String(formData.get("endsOn") ?? "") || null;
  const isDate = (v: string | null) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(startsOn) || !isDate(endsOn)) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("terms")
    .insert({ org_id: ctx.orgId, name, starts_on: startsOn, ends_on: endsOn })
    .select("id")
    .single();
  if (error) return; // don't audit a creation that didn't happen
  await logAudit(supabase, ctx.orgId, ctx.userId, "create", "terms", data?.id ?? null, null, {
    name,
    starts_on: startsOn,
    ends_on: endsOn,
  });

  revalidatePath("/settings");
}

export async function toggleSiteActive(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const input = parseFields(formData, { siteId: uuidField, active: boolText });
  if (!input) return;
  const { siteId } = input;
  const active = input.active === "true";

  const supabase = await createClient();
  await supabase.from("sites").update({ is_active: active }).eq("id", siteId).eq("org_id", ctx.orgId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "sites", siteId, null, { is_active: active });
  revalidatePath("/settings");
}

export async function deleteSite(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const input = parseFields(formData, { siteId: uuidField });
  if (!input) return;
  const { siteId } = input;

  const supabase = await createClient();
  // Guard: don't delete a site programs still point at.
  const { count } = await supabase
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("site_id", siteId);
  if (count && count > 0) return;

  const { data: before } = await supabase.from("sites").select("name").eq("id", siteId).maybeSingle();
  await supabase.from("sites").delete().eq("id", siteId).eq("org_id", ctx.orgId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "delete", "sites", siteId, before, null);
  revalidatePath("/settings");
}

export async function deleteTerm(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const input = parseFields(formData, { termId: uuidField });
  if (!input) return;
  const { termId } = input;

  const supabase = await createClient();
  const { count } = await supabase
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("term_id", termId);
  if (count && count > 0) return;

  const { data: before } = await supabase.from("terms").select("name").eq("id", termId).maybeSingle();
  await supabase.from("terms").delete().eq("id", termId).eq("org_id", ctx.orgId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "delete", "terms", termId, before, null);
  revalidatePath("/settings");
}

// Configurable flag thresholds (0006). Read by lib/flags.ts; falls back to
// code defaults when unset. Admin-only, audited.
function clampInt(v: FormDataEntryValue | null, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(String(v ?? "").trim()));
  if (Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export async function updateThresholds(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const warning = clampInt(formData.get("chronicWarningPct"), 1, 100, 10);
  const critical = Math.max(warning, clampInt(formData.get("chronicCriticalPct"), 1, 100, 20));
  const minSessions = clampInt(formData.get("chronicMinSessions"), 1, 60, 5);
  const ratioRaw = String(formData.get("ratioDefaultTarget") ?? "").trim();
  const ratioDefault = ratioRaw ? clampInt(ratioRaw, 1, 100, 10) : null;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("org_settings")
    .select("chronic_warning_pct, chronic_critical_pct, chronic_min_sessions, ratio_default_target")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  const after = {
    org_id: ctx.orgId,
    chronic_warning_pct: warning,
    chronic_critical_pct: critical,
    chronic_min_sessions: minSessions,
    ratio_default_target: ratioDefault,
  };
  await supabase.from("org_settings").upsert(after, { onConflict: "org_id" });
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "org_settings", ctx.orgId, before, after);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------
// Data retention & purge (0016, FR-I.4). Purging is destructive, so
// runRetentionPurge requires two independent confirmations from the form
// (a typed "PURGE" and a checked acknowledgement) and always recomputes
// eligibility server-side rather than trusting a client-submitted id list.
// The delete itself runs on the service-role client, bypassing RLS — the
// pattern 0015's audit_log migration comment explicitly calls out for
// retention/erasure requests.
// ---------------------------------------------------------------------
export async function updateRetentionSettings(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const raw = String(formData.get("retentionYears") ?? "").trim();
  const retentionYears = raw ? clampInt(raw, 1, 50, 7) : null;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("org_settings")
    .select("retention_years")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  await supabase
    .from("org_settings")
    .upsert({ org_id: ctx.orgId, retention_years: retentionYears }, { onConflict: "org_id" });
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "org_settings", ctx.orgId, before, {
    retention_years: retentionYears,
  });

  revalidatePath("/settings");
}

export async function runRetentionPurge(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const confirmText = String(formData.get("confirmText") ?? "").trim();
  const confirmCheck = String(formData.get("confirmCheck") ?? "");
  if (confirmText !== "PURGE" || confirmCheck !== "on") return;

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("org_settings")
    .select("retention_years")
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  const retentionYears = settings?.retention_years;
  if (!retentionYears) return;

  const candidates = await getPurgeCandidates(supabase, ctx.orgId, retentionYears);
  if (candidates.length === 0) return;

  const ids = candidates.map((c) => c.id);
  const admin = createAdminClient();
  const { error } = await admin.from("participants").delete().in("id", ids).eq("org_id", ctx.orgId);
  if (error) return; // don't audit a purge that didn't actually happen

  // Record that a purge happened without writing purged participants' names
  // into audit_log, which is permanently append-only and has no purge of
  // its own — that would defeat the erasure this action is meant to do.
  await logAudit(supabase, ctx.orgId, ctx.userId, "purge", "participants", null, {
    count: candidates.length,
    participant_ids: ids,
  }, { retention_years: retentionYears });

  revalidatePath("/settings");
  revalidatePath("/participants");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
}

// ---------------------------------------------------------------------
// Delete organization. Every org-scoped table has ON DELETE CASCADE back
// to orgs(id) (see 0001_init.sql), so removing the orgs row is sufficient
// to erase everything belonging to it — including that org's own
// audit_log rows, which is correct here: once the org itself is gone
// there's nothing left for an audit trail to be about. Runs on the
// service-role client since RLS has no delete policy on orgs at all.
// Deliberately does not touch auth.users/profiles — a person can belong
// to more than one org, so deleting one org must not delete their login.
// ---------------------------------------------------------------------
export async function deleteOrg(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const confirmText = String(formData.get("confirmText") ?? "").trim();
  const confirmCheck = String(formData.get("confirmCheck") ?? "");
  if (confirmText !== ctx.orgName || confirmCheck !== "on") return;

  const admin = createAdminClient();
  const { error } = await admin.from("orgs").delete().eq("id", ctx.orgId);
  if (error) return;

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------
// Calendar feeds (0007, FR-E.5). A feed URL carries a secret token, so
// creating or revoking one is an admin action and is audited.
// ---------------------------------------------------------------------
function newFeedToken() {
  // 32 hex chars from the Web Crypto API — unguessable and URL-safe.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createCalendarFeed(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  // scope is "all", a site id, or "staff:<userId>" — a feed is never both
  const scope = String(formData.get("scope") ?? "all").trim();
  let siteId: string | null = null;
  let userId: string | null = null;
  if (scope.startsWith("staff:")) userId = scope.slice(6) || null;
  else if (scope !== "" && scope !== "all") siteId = scope;

  const label = String(formData.get("label") ?? "").trim() || "Program calendar";
  const token = newFeedToken();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_feeds")
    .insert({
      org_id: ctx.orgId,
      site_id: siteId,
      user_id: userId,
      label,
      token,
      created_by: ctx.userId,
    })
    .select("id")
    .maybeSingle();
  if (error) return;

  await logAudit(supabase, ctx.orgId, ctx.userId, "create", "calendar_feeds", data?.id ?? null, null, {
    label,
    site_id: siteId,
    user_id: userId,
  });
  revalidatePath("/settings");
}

export async function revokeCalendarFeed(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const feedId = String(formData.get("feedId") ?? "").trim();
  if (!feedId) return;

  const supabase = await createClient();
  await supabase
    .from("calendar_feeds")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", feedId)
    .eq("org_id", ctx.orgId);

  await logAudit(supabase, ctx.orgId, ctx.userId, "revoke", "calendar_feeds", feedId, null, null);
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------
// Public registration links (0011). Like calendar feeds, the URL carries a
// secret token; creating/revoking is an admin action and is audited.
// ---------------------------------------------------------------------
export async function createRegistrationLink(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const label = String(formData.get("label") ?? "").trim() || "Registration";
  const token = newFeedToken();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registration_links")
    .insert({ org_id: ctx.orgId, label, token, created_by: ctx.userId })
    .select("id")
    .maybeSingle();
  if (error) return;

  await logAudit(
    supabase,
    ctx.orgId,
    ctx.userId,
    "create",
    "registration_links",
    data?.id ?? null,
    null,
    { label },
  );
  revalidatePath("/settings");
}

export async function revokeRegistrationLink(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const linkId = String(formData.get("linkId") ?? "").trim();
  if (!linkId) return;

  const supabase = await createClient();
  await supabase
    .from("registration_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("org_id", ctx.orgId);

  await logAudit(supabase, ctx.orgId, ctx.userId, "revoke", "registration_links", linkId, null, null);
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------
// Adding people (0026). An admin adds someone by email. An existing account
// is attached straight away; anyone else waits in org_invites until they
// sign in with that email (see lib/invites.ts).
// ---------------------------------------------------------------------
const ROLES = ["admin", "director", "staff", "viewer"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AddResult = "added" | "pending" | "exists" | "failed";

// One person: attach now if they already have an account, otherwise save an
// invite that's claimed at sign-in. Shared by the single and bulk add forms.
async function addOneMember(
  ctx: { orgId: string; userId: string },
  email: string,
  role: string,
  name: string | null,
): Promise<AddResult> {
  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("email", email)
    .maybeSingle();

  if (profile) {
    const { data: existing } = await admin
      .from("memberships")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (existing) return "exists";

    const { error } = await admin.from("memberships").insert({
      org_id: ctx.orgId,
      user_id: profile.id,
      role,
      status: "active",
    });
    if (error) {
      console.error("[settings] addMember membership insert failed:", error);
      return "failed";
    }
    // Fill in the name only if they don't have one of their own yet.
    if (name && needsName(profile.full_name, email)) {
      await admin.from("profiles").update({ full_name: name }).eq("id", profile.id);
    }
    await logAudit(supabase, ctx.orgId, ctx.userId, "create", "memberships", null, null, { email, role });
    return "added";
  }

  const { error } = await admin.from("org_invites").upsert(
    { org_id: ctx.orgId, email, role, full_name: name, invited_by: ctx.userId },
    { onConflict: "org_id,email" },
  );
  if (error) {
    console.error("[settings] addMember invite insert failed:", error);
    return "failed";
  }
  await logAudit(supabase, ctx.orgId, ctx.userId, "create", "org_invites", null, null, { email, role });
  return "pending";
}

export async function addMember(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) redirect("/settings?invite=denied");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  const name = cleanName(formData.get("name")) || null;
  if (!EMAIL_RE.test(email) || !(ROLES as readonly string[]).includes(role)) {
    redirect("/settings?invite=invalid");
  }

  const result = await addOneMember(ctx, email, role, name);
  revalidatePath("/settings");
  redirect(`/settings?invite=${result}`);
}

// Paste a list: one person per line (or separated by commas/semicolons).
// Each line is "email", "email role", or "name | email | role" (the role is
// optional and overrides the default for that person).
const MAX_BULK = 200;

export async function bulkAddMembers(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) redirect("/settings?invite=denied");

  const defaultRole = String(formData.get("role") ?? "");
  if (!(ROLES as readonly string[]).includes(defaultRole)) redirect("/settings?invite=invalid");

  const tokens = String(formData.get("emails") ?? "")
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  // Keep the first entry for each email, so a repeat in the paste is ignored.
  const people = new Map<string, { role: string; name: string | null }>();
  const invalid: string[] = [];
  for (const token of tokens) {
    let name: string | null = null;
    let rawEmail: string | undefined;
    let rawRole: string | undefined;
    let extra: string | undefined;
    if (token.includes("|")) {
      const parts = token.split("|").map((p) => p.trim());
      if (parts.length > 3) {
        invalid.push(token);
        continue;
      }
      if (parts.length === 3) [name, rawEmail, rawRole] = [parts[0], parts[1], parts[2]];
      else [name, rawEmail] = [parts[0], parts[1]];
      name = cleanName(name) || null;
    } else {
      [rawEmail, rawRole, extra] = token.split(/\s+/);
    }
    const email = (rawEmail ?? "").toLowerCase();
    const role = rawRole ? rawRole.toLowerCase() : defaultRole;
    if (!EMAIL_RE.test(email) || extra !== undefined || !(ROLES as readonly string[]).includes(role)) {
      invalid.push(token);
      continue;
    }
    if (!people.has(email)) people.set(email, { role, name });
  }

  if (people.size > MAX_BULK) redirect(`/settings?bulk=too_many&max=${MAX_BULK}`);

  const counts: Record<AddResult, number> = { added: 0, pending: 0, exists: 0, failed: 0 };
  for (const [email, { role, name }] of people) {
    counts[await addOneMember(ctx, email, role, name)]++;
  }

  revalidatePath("/settings");
  const params = new URLSearchParams({
    bulk: "1",
    added: String(counts.added),
    pending: String(counts.pending),
    exists: String(counts.exists),
    failed: String(counts.failed),
    invalid: String(invalid.length),
    invalidList: invalid.slice(0, 20).join(", "),
  });
  redirect(`/settings?${params.toString()}`);
}

export async function revokeInvite(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("org_invites")
    .select("email, role")
    .eq("id", inviteId)
    .maybeSingle();
  if (!before) return;
  await supabase.from("org_invites").delete().eq("id", inviteId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "delete", "org_invites", inviteId, before, null);
  revalidatePath("/settings");
}
