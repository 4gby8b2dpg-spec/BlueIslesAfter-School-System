import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { safeRedirectPath } from "../lib/safe-redirect.mjs";

test("safeRedirectPath accepts local paths", () => {
  assert.equal(safeRedirectPath("/participants?site=west#list"), "/participants?site=west#list");
});

test("safeRedirectPath rejects external and executable URLs", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example/path",
    "/\\\\evil.example/path",
    "javascript:alert(1)",
    "data:text/html,bad",
    "dashboard",
  ]) {
    assert.equal(safeRedirectPath(value), "/dashboard");
  }
});

test("security migration replaces the legacy recurrence write policy", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/0024_security_hardening.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /'session_recurrencies'/);
  assert.match(
    migration,
    /drop policy if exists session_recurrencies_write on session_recurrencies/,
  );
});
