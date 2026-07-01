/**
 * Regression guard for tenant-isolation coverage of the private-company tables.
 *
 * `private_financials` and `private_cap_table` are tenant-scoped (each row has
 * an `org_id` UUID FK to `organizations` and is accessed via `withOrgContext`,
 * which sets `app.current_org_id`). They must therefore be enrolled in the
 * tenant-isolation RLS policy that `bootstrapRls()` applies on boot. They were
 * once introduced without that enrollment; this test fails if either table
 * drops out of the policy array again.
 *
 * It asserts against the RLS_SQL string constant only (no DB connection), so it
 * runs anywhere `tsx` does.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { RLS_SQL } from "../rls-sql";

test("RLS bootstrap enrolls private-company tenant tables", () => {
  for (const table of ["private_financials", "private_cap_table"]) {
    assert.ok(
      RLS_SQL.includes(`'${table}'`),
      `RLS_SQL is missing tenant table ${table} from its policy array`,
    );
    // And the tenant-isolation policy template must exist to apply to them.
    assert.ok(
      RLS_SQL.includes("_tenant_isolation"),
      "RLS_SQL is missing the tenant-isolation policy template",
    );
  }
});
