// Las migraciones recientes deben poder volver a ejecutarse en el SQL Editor sin error
// (por ejemplo, si una ejecución anterior quedó a medias).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshDb } from "./supabase-harness.mjs";

const RERUNNABLE = [
  "20261101000000_overbooking_and_revenue.sql", "20261102000000_plan_entitlements.sql", "20261103000000_premium_price.sql",
  "20261104000000_premium_launch_promo.sql", "20261105000000_time_off_management.sql", "20261106000000_business_deletion.sql",
  "20261107000000_plans_v2.sql",
];

test("las migraciones de sobrecupos y planes se pueden ejecutar de nuevo", async () => {
  const db = await freshDb();
  for (const file of RERUNNABLE) {
    await db.exec(readFileSync(join(import.meta.dirname, "..", "..", "supabase", "migrations", file), "utf8"));
  }
  const { rows } = await db.query("select code from public.plans where code is not null order by sort_order");
  assert.deepEqual(rows.map((r) => r.code), ["free", "premium"]);
  const gated = await db.query("select prolang = (select oid from pg_language where lanname = 'plpgsql') ok from pg_proc where proname = 'panel_revenue'");
  assert.equal(gated.rows[0].ok, true, "panel_revenue debe quedar con la versión que exige Premium");
});
