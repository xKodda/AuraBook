// Planes Free y Premium: capacidades efectivas y su aplicación en la base de datos (migración 20261102000000).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let tuesday;
let barberOwner;

const limits = async (businessId) =>
  (await db.query("select tier, status, max_staff, features from public.business_limits($1)", [businessId])).rows[0];
const setSubscription = (sql) => db.query(`update public.subscriptions set ${sql} where business_id = $1`, [IDS.barber]);
const publicStaff = () =>
  as(db, "anon", null, async (tx) => {
    const { rows } = await tx.query("select distinct staff_id from public.available_slots('barber-studio', $1, $2::date)", [IDS.barberCut, tuesday]);
    return rows.map((r) => r.staff_id).sort();
  });

before(async () => {
  db = await freshDb();
  tuesday = await nextWeekday(db, 2);
  barberOwner = await createUser(db);
  await addMember(db, IDS.barber, barberOwner, "owner");
});

describe("planes publicados", () => {
  test("Free y Premium quedan visibles para /precios, con 30 días de prueba", async () => {
    const data = await as(db, "anon", null, async (tx) => (await tx.query("select public.public_plans() p")).rows[0].p);
    assert.equal(data.trialDays, 30);
    assert.deepEqual(data.plans.map((p) => [p.code, p.priceClp, p.maxStaff]), [["free", 0, 1], ["premium", 12990, 3]]);
    assert.deepEqual(data.plans[1].features, ["client_reminders", "revenue_stats"]);
  });
});

describe("capacidades efectivas", () => {
  test("en prueba, el negocio tiene Premium", async () => {
    assert.deepEqual(await limits(IDS.barber), {
      tier: "premium", status: "trial", max_staff: 3, features: ["client_reminders", "revenue_stats"],
    });
  });

  test("el panel ve las capacidades de sus negocios", async () => {
    const rows = await as(db, "authenticated", barberOwner, async (tx) => (await tx.query("select * from public.my_entitlements()")).rows);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tier, "premium");
    assert.equal(rows[0].staff_count, 2);
  });

  test("un pago vigente en un plan anterior cuenta como Premium con su propio límite", async () => {
    const { rows } = await db.query("insert into public.plans (name, price_clp, max_staff, is_active) values ('Equipo', 19990, 5, false) returning id");
    await setSubscription(`plan_id = '${rows[0].id}', paid_until = now() + interval '10 days'`);
    const l = await limits(IDS.barber);
    assert.equal(l.tier, "premium");
    assert.equal(l.max_staff, 5);
    assert.ok(l.features.includes("client_reminders"));
    await setSubscription("plan_id = null, paid_until = null");
  });
});

describe("al vencer la prueba pasa a Free", () => {
  before(async () => {
    await setSubscription("trial_ends_at = now() - interval '1 day'");
  });

  test("las capacidades son las de Free", async () => {
    assert.deepEqual(await limits(IDS.barber), { tier: "free", status: "past_due", max_staff: 1, features: [] });
  });

  test("la página pública solo ofrece al primer profesional", async () => {
    assert.deepEqual(await publicStaff(), [IDS.barberCarlos]);
  });

  test("no se pueden agregar profesionales por sobre el plan", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => tx.query("select public.save_staff($1, null, 'Nuevo Barbero')", [IDS.barber])),
      /PLAN_STAFF_LIMIT/,
    );
  });

  test("los ingresos del panel requieren Premium", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => tx.query("select * from public.panel_revenue($1, $2::date, $2::date)", [IDS.barber, tuesday])),
      /PLAN_FEATURE_REQUIRED/,
    );
  });

  test("los recordatorios no se envían ni se ofrecen en Free", async () => {
    const { rows } = await db.query("select public.business_has_feature($1, 'client_reminders') ok", [IDS.barber]);
    assert.equal(rows[0].ok, false);
    const plan = await as(db, "anon", null, async (tx) =>
      (await tx.query("select public.public_business_plan('barber-studio') p")).rows[0].p);
    assert.deepEqual(plan, { features: [], staffIds: [IDS.barberCarlos] });
  });

  test("al pagar Premium vuelve todo el equipo a la página pública", async () => {
    await setSubscription(`plan_id = (select id from public.plans where code = 'premium'), paid_until = now() + interval '30 days'`);
    assert.deepEqual(await publicStaff(), [IDS.barberCarlos, IDS.barberMatias].sort());
  });
});
