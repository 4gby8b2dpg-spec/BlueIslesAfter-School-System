#!/usr/bin/env node
/**
 * Cross-org tenant isolation test.
 *
 * Every table in this app is org-scoped and protected only by RLS. If a policy
 * is missing or wrong, one customer's data becomes readable by another — and
 * nothing in the UI would reveal it, because the UI always filters by org_id
 * before asking. This test asks the way an attacker would: straight at the
 * REST API with a valid session for a *different* org.
 *
 * What it checks
 *   1. READ isolation  — Org A's user cannot see any of Org B's rows.
 *   2. TARGETED read   — Org A's user cannot fetch Org B's rows by exact id.
 *   3. WRITE isolation — Org A's user cannot insert into or update Org B's org.
 *   4. ROLE limits     — a viewer cannot write; nobody can mutate audit_log.
 *
 * Check 2 needs the service-role key to learn which ids exist in Org B. Without
 * it the script still runs, but a table that happens to be empty in Org B will
 * pass vacuously — so it reports coverage separately from pass/fail.
 *
 * Usage:
 *   node scripts/rls-isolation-test.mjs
 *
 * Point it at a STAGING project. It writes probe rows on failure paths and
 * should never be aimed at production.
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- config

const required = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return v;
};

const SUPABASE_URL = required("SUPABASE_URL");
const ANON_KEY = required("SUPABASE_ANON_KEY");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

const ORG_A = {
  email: required("RLS_TEST_ORG_A_EMAIL"),
  password: required("RLS_TEST_ORG_A_PASSWORD"),
};
const ORG_B = {
  email: required("RLS_TEST_ORG_B_EMAIL"),
  password: required("RLS_TEST_ORG_B_PASSWORD"),
};
// Optional: a viewer-role member of Org A, for the role-limit checks.
const VIEWER =
  process.env.RLS_TEST_VIEWER_EMAIL && process.env.RLS_TEST_VIEWER_PASSWORD
    ? {
        email: process.env.RLS_TEST_VIEWER_EMAIL,
        password: process.env.RLS_TEST_VIEWER_PASSWORD,
      }
    : null;

/**
 * Every org-scoped table, mirroring the RLS loop in
 * supabase/migrations/0001_init.sql plus the tables added by later migrations.
 * Keep this list in sync — a table missing here is a table nobody tests.
 */
const ORG_SCOPED_TABLES = [
  "sites",
  "user_site_access",
  "terms",
  "imports",
  "participants",
  "guardians",
  "guardians_link",
  "programs",
  "activities",
  "enrollments",
  "sessions",
  "session_staff",
  "attendance_records",
  "import_mapping_templates",
  "import_rows",
  "surveys",
  "survey_questions",
  "survey_responses",
  "survey_answers",
  "calendar_events",
  "flags",
  "audit_log",
  "memberships",
  "ai_insights",
  "ai_query_log",
  "calendar_feeds",
  "contact_log",
  "org_settings",
  "registration_links",
  "registrations",
  "report_deliveries",
  "report_schedules",
];

// ---------------------------------------------------------------- harness

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  const mark = ok ? "[32mPASS[0m" : "[31mFAIL[0m";
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function signIn(creds, label) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword(creds);
  if (error) {
    console.error(`Could not sign in ${label} (${creds.email}): ${error.message}`);
    process.exit(2);
  }
  return { client, userId: data.user.id };
}

/** The org this signed-in user actually belongs to. */
async function resolveOrgId(client, label) {
  const { data, error } = await client
    .from("memberships")
    .select("org_id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    console.error(`Could not resolve org for ${label}: ${error?.message ?? "no active membership"}`);
    process.exit(2);
  }
  return data.org_id;
}

// ---------------------------------------------------------------- checks

/**
 * 1 + 2. Nothing Org A can read may belong to Org B, and Org A must not be able
 * to fetch Org B's rows even when it knows their exact ids.
 */
async function checkReadIsolation(aClient, orgA, orgB, admin) {
  console.log("\nRead isolation (Org A must not see Org B's rows)");
  let unverified = 0;

  for (const table of ORG_SCOPED_TABLES) {
    // Direct attempt: ask explicitly for the other org's rows.
    const { data: leaked, error } = await aClient
      .from(table)
      .select("*")
      .eq("org_id", orgB)
      .limit(5);

    if (error) {
      // A permission error is a pass: the policy refused the request outright.
      const denied = /permission|policy|denied/i.test(error.message);
      record(`${table}: filtered by org_id`, denied, denied ? "denied by policy" : error.message);
      continue;
    }

    if (leaked && leaked.length > 0) {
      record(`${table}: filtered by org_id`, false, `LEAKED ${leaked.length} row(s) from Org B`);
      continue;
    }

    // The query returned nothing — but did Org B have anything to leak? Without
    // the service-role key we can't tell an enforced policy from an empty table.
    if (admin) {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgB);
      if (!count) {
        unverified += 1;
        record(`${table}: filtered by org_id`, true, "no Org B rows — coverage unverified");
        continue;
      }
      record(`${table}: filtered by org_id`, true, `${count} Org B row(s) correctly hidden`);
    } else {
      unverified += 1;
      record(`${table}: filtered by org_id`, true, "coverage unverified (no service key)");
    }
  }

  // Targeted fetch by primary key — catches policies that filter list queries
  // but not single-row lookups.
  if (admin) {
    console.log("\nTargeted read isolation (fetch Org B rows by exact id)");
    for (const table of ORG_SCOPED_TABLES) {
      const { data: theirs } = await admin
        .from(table)
        .select("id")
        .eq("org_id", orgB)
        .limit(3);
      if (!theirs?.length) continue;

      const ids = theirs.map((r) => r.id);
      const { data: got, error } = await aClient.from(table).select("id").in("id", ids);
      const leaked = !error && got && got.length > 0;
      record(
        `${table}: id lookup blocked`,
        !leaked,
        leaked ? `LEAKED ${got.length} row(s) by id` : `${ids.length} id(s) correctly hidden`,
      );
    }
  }

  return unverified;
}

/** 3. Org A must not be able to write rows tagged with Org B's id. */
async function checkWriteIsolation(aClient, orgB) {
  console.log("\nWrite isolation (Org A must not write into Org B)");

  const { error: insertError } = await aClient.from("participants").insert({
    org_id: orgB,
    first_name: "RLS",
    last_name: "Probe",
  });
  record(
    "participants: cross-org insert rejected",
    Boolean(insertError),
    insertError ? insertError.message.slice(0, 60) : "INSERT SUCCEEDED — policy is missing WITH CHECK",
  );

  const { data: updated, error: updateError } = await aClient
    .from("participants")
    .update({ last_name: "Tampered" })
    .eq("org_id", orgB)
    .select("id");
  const blocked = Boolean(updateError) || !updated?.length;
  record(
    "participants: cross-org update rejected",
    blocked,
    blocked ? "no rows affected" : `UPDATED ${updated.length} row(s) in Org B`,
  );
}

/** 4. Role limits inside a single org. */
async function checkRoleLimits(aClient, orgA) {
  console.log("\nRole and integrity limits");

  // audit_log must be append-only: tampering with the trail defeats its purpose.
  const { data: auditUpdated, error: auditUpdateError } = await aClient
    .from("audit_log")
    .update({ action: "tampered" })
    .eq("org_id", orgA)
    .select("id");
  const auditUpdateBlocked = Boolean(auditUpdateError) || !auditUpdated?.length;
  record(
    "audit_log: update rejected",
    auditUpdateBlocked,
    auditUpdateBlocked ? "append-only holds" : `UPDATED ${auditUpdated.length} audit row(s)`,
  );

  const { data: auditDeleted, error: auditDeleteError } = await aClient
    .from("audit_log")
    .delete()
    .eq("org_id", orgA)
    .select("id");
  const auditDeleteBlocked = Boolean(auditDeleteError) || !auditDeleted?.length;
  record(
    "audit_log: delete rejected",
    auditDeleteBlocked,
    auditDeleteBlocked ? "append-only holds" : `DELETED ${auditDeleted.length} audit row(s)`,
  );

  if (!VIEWER) {
    console.log("  (skipping viewer checks — RLS_TEST_VIEWER_* not set)");
    return;
  }

  const { client: viewerClient } = await signIn(VIEWER, "viewer");
  const { error: viewerInsertError } = await viewerClient.from("participants").insert({
    org_id: orgA,
    first_name: "Viewer",
    last_name: "Probe",
  });
  record(
    "viewer: insert rejected",
    Boolean(viewerInsertError),
    viewerInsertError ? "read-only enforced" : "INSERT SUCCEEDED — viewer is not read-only",
  );
}

// ---------------------------------------------------------------- main

async function main() {
  console.log(`RLS isolation test against ${SUPABASE_URL}`);
  if (!SERVICE_KEY) {
    console.log("Note: SUPABASE_SERVICE_ROLE_KEY not set — coverage cannot be verified.\n");
  }

  const admin = SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const { client: aClient } = await signIn(ORG_A, "Org A user");
  const { client: bClient } = await signIn(ORG_B, "Org B user");

  const orgA = await resolveOrgId(aClient, "Org A user");
  const orgB = await resolveOrgId(bClient, "Org B user");

  if (orgA === orgB) {
    console.error("Org A and Org B users belong to the same org — the test would prove nothing.");
    process.exit(2);
  }
  console.log(`Org A = ${orgA}\nOrg B = ${orgB}`);

  const unverified = await checkReadIsolation(aClient, orgA, orgB, admin);
  await checkWriteIsolation(aClient, orgB);
  await checkRoleLimits(aClient, orgA);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (unverified) {
    console.log(
      `${unverified} table(s) had no Org B rows to hide — seed them for real coverage.`,
    );
  }

  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log("Tenant isolation holds.");
}

main().catch((err) => {
  console.error("Test harness error:", err);
  process.exit(2);
});
