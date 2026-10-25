// Planes, suscripciones y panel de plataforma: acceso solo para platform_admins y cálculos de ingresos.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb } from "./supabase-harness.mjs";

let db;
let admin;
let owner;
let staffUser;
let planId;

const snapshot = async () =>
  (await as(db, "authenticated", admin, (tx) => tx.query("select public.admin_snapshot() as s"))).rows[0].s;

before(async () => {
  db = await freshDb();
  admin = await createUser(db);
  owner = await createUser(db);
  staffUser = await createUser(db);
  await db.query("insert into public.platform_admins (user_id) values ($1)", [admin]);
  await addMember(db, IDS.barber, owner, "owner");
  await addMember(db, IDS.barber, staffUser, "staff", IDS.barberCarlos);
});

describe("suscripciones", () => {
  test("todo negocio tiene prueba gratis, incluidos los creados después", async () => {
    const { rows } = await db.query("select count(*)::int n from public.businesses b left join public.subscriptions s on s.business_id = b.id where s.business_id is null");
    assert.equal(rows[0].n, 0);
    const user = await createUser(db);
    const created = await commitAs(db, "authenticated", user, (tx) =>
      tx.query("select * from public.create_business_with_owner('Nuevo Local', 'nuevo-local', 'spa')"));
    const sub = await db.query(
      "select public.subscription_status(trial_ends_at, paid_until, cancelled_at) st, trial_ends_at > now() + interval '13 days' ok from public.subscriptions where business_id = $1",
      [created.rows[0].business_id],
    );
    assert.deepEqual(sub.rows[0], { st: "trial", ok: true });
  });

  test("las tablas de facturación no son accesibles directamente", async () => {
    for (const table of ["plans", "subscriptions", "subscription_payments", "platform_admins", "platform_settings"]) {
      await assert.rejects(as(db, "authenticated", admin, (tx) => tx.query(`select * from public.${table}`)), /permission denied/);
      await assert.rejects(as(db, "anon", null, (tx) => tx.query(`select * from public.${table}`)), /permission denied/);
    }
  });
});

describe("panel de plataforma", () => {
  test("solo un platform_admin puede usarlo", async () => {
    for (const user of [owner, staffUser]) {
      await assert.rejects(as(db, "authenticated", user, (tx) => tx.query("select public.admin_snapshot()")), /FORBIDDEN/);
      await assert.rejects(
        as(db, "authenticated", user, (tx) => tx.query("select public.admin_save_plan(null, 'Gratis', null, 0, null, true)")),
        /FORBIDDEN/,
      );
    }
    await assert.rejects(as(db, "anon", null, (tx) => tx.query("select public.admin_snapshot()")), /permission denied/);
    const { rows } = await as(db, "authenticated", owner, (tx) => tx.query("select public.is_platform_admin() a"));
    assert.equal(rows[0].a, false);
  });

  test("crea un plan y registra un pago: activa la suscripción y suma ingresos", async () => {
    await commitAs(db, "authenticated", admin, async (tx) => {
      const { rows } = await tx.query("select public.admin_save_plan(null, 'Equipo', 'Hasta 5', 19990, 5, true) id");
      planId = rows[0].id;
      await tx.query("select public.admin_record_payment($1, $2, 39980, 2, (now() at time zone 'America/Santiago')::date, 'transferencia', 'TRX-1')", [
        IDS.barber, planId,
      ]);
    });
    const s = await snapshot();
    const barber = s.businesses.find((b) => b.id === IDS.barber);
    assert.equal(barber.status, "active");
    assert.equal(barber.planName, "Equipo");
    assert.equal(s.overview.mrrClp, 19990);
    assert.equal(s.overview.collectedThisMonthClp, 39980);
    assert.equal(s.overview.byStatus.active, 1);
    assert.equal(s.overview.revenueByMonth.length, 6);
    assert.equal(s.overview.revenueByMonth.at(-1).amountClp, 39980);
    assert.equal(s.plans.find((p) => p.id === planId).subscribers, 1);
    assert.equal(s.payments[0].reference, "TRX-1");
  });

  test("pagar durante la prueba no pierde días: el periodo pagado empieza al terminar la prueba", async () => {
    const { rows } = await db.query(
      "select (period_start >= (select trial_ends_at from public.subscriptions where business_id = $1)) ok, period_end = period_start + interval '2 months' as two_months from public.subscription_payments where business_id = $1",
      [IDS.barber],
    );
    assert.equal(rows[0].ok, true);
    assert.equal(rows[0].two_months, true);
  });

  test("un pago siguiente se suma al final del periodo vigente", async () => {
    const before = (await db.query("select paid_until from public.subscriptions where business_id = $1", [IDS.barber])).rows[0].paid_until;
    await commitAs(db, "authenticated", admin, (tx) =>
      tx.query("select public.admin_record_payment($1, $2, 19990, 1, current_date, 'efectivo')", [IDS.barber, planId]));
    const { rows } = await db.query("select period_start from public.subscription_payments where business_id = $1 order by created_at desc limit 1", [IDS.barber]);
    assert.equal(rows[0].period_start.getTime(), before.getTime());
  });

  test("valida montos, meses, método y fecha futura", async () => {
    const pay = (args) => as(db, "authenticated", admin, (tx) =>
      tx.query(`select public.admin_record_payment($1, $2, ${args})`, [IDS.barber, planId]));
    await assert.rejects(pay("-1, 1, current_date, 'efectivo'"), /INVALID_AMOUNT/);
    await assert.rejects(pay("1000, 0, current_date, 'efectivo'"), /INVALID_MONTHS/);
    await assert.rejects(pay("1000, 1, current_date, 'bitcoin'"), /INVALID_METHOD/);
    await assert.rejects(pay("1000, 1, current_date + 30, 'efectivo'"), /INVALID_PAID_AT/);
  });

  test("prueba vencida queda como vencida; extenderla la vuelve a prueba; cancelar y reactivar", async () => {
    await db.query("update public.subscriptions set trial_ends_at = now() - interval '1 day' where business_id = $1", [IDS.nails]);
    let s = await snapshot();
    assert.equal(s.businesses.find((b) => b.id === IDS.nails).status, "past_due");
    await commitAs(db, "authenticated", admin, (tx) => tx.query("select public.admin_extend_trial($1, 7)", [IDS.nails]));
    s = await snapshot();
    assert.equal(s.businesses.find((b) => b.id === IDS.nails).status, "trial");
    await commitAs(db, "authenticated", admin, (tx) => tx.query("select public.admin_set_cancelled($1, true, 'No continuó')", [IDS.nails]));
    s = await snapshot();
    assert.equal(s.businesses.find((b) => b.id === IDS.nails).status, "cancelled");
    await commitAs(db, "authenticated", admin, (tx) => tx.query("select public.admin_set_cancelled($1, false)", [IDS.nails]));
    s = await snapshot();
    assert.equal(s.businesses.find((b) => b.id === IDS.nails).status, "trial");
  });
});

describe("vista del dueño", () => {
  test("el dueño ve su plan, pagos y planes disponibles", async () => {
    const { rows } = await as(db, "authenticated", owner, (tx) =>
      tx.query("select public.get_business_subscription($1) s", [IDS.barber]));
    const sub = rows[0].s;
    assert.equal(sub.status, "active");
    assert.equal(sub.plan.name, "Equipo");
    assert.equal(sub.staffCount, 2);
    assert.equal(sub.payments.length, 2);
    assert.ok(sub.availablePlans.some((p) => p.id === planId));
  });

  test("un profesional o un tercero no la ven", async () => {
    await assert.rejects(
      as(db, "authenticated", staffUser, (tx) => tx.query("select public.get_business_subscription($1)", [IDS.barber])),
      /FORBIDDEN/,
    );
    const outsider = await createUser(db);
    await assert.rejects(
      as(db, "authenticated", outsider, (tx) => tx.query("select public.get_business_subscription($1)", [IDS.barber])),
      /FORBIDDEN/,
    );
    const mine = await as(db, "authenticated", staffUser, (tx) => tx.query("select * from public.my_subscriptions()"));
    assert.equal(mine.rows.length, 0);
  });
});
