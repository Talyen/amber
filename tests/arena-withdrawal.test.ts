import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/neon-http";
import { deleteActiveArenaEntry } from "../src/data/arena-entry.ts";

test("withdrawal targets only the selected user's current unfinalized community entry", () => {
  const { sql, params } = deleteActiveArenaEntry(
    drizzle.mock(), "account", "2026-11", "active-entry",
  ).toSQL();
  assert.deepEqual(params, ["active-entry", "account", 0, "2026-11"]);
  assert.match(sql, /"arena_portfolios"\."id" = \$1/);
  assert.match(sql, /"arena_portfolios"\."user_id" = \$2/);
  assert.match(sql, /"arena_portfolios"\."is_bot" = \$3/);
  assert.match(sql, /"arena_portfolios"\."final_return_pct" is null/i);
  assert.match(sql, /coalesce\("arena_portfolios"\."period_key",[\s\S]+\) = \$4/i);
  assert.match(sql, /returning "id", "handle"$/i);
});
