// Contratar Premium por transferencia: solicitudes de pago (migración 20261110000000).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb } from "./supabase-harness.mjs";

let db;
let owner;
let staffUser;
let otherOwner;
let admin;

const sub = async () => (await db.query(
  "select public.subscription_status(trial_ends_at, paid_until, cancelled_at) status, extra_staff, billing_period from public.subscriptions where business_id = $1",
  [IDS.barber])).rows[0];

before(async () => {
  db = await freshDb();
  owner = await createUser(db);
  staffUser = await createUser(db);
  otherOwner = await createUser(db);
  admin = await createUser(db);
  await addMember(db, IDS.barber, owner, "owner");
  await addMember(db, IDS.barber, staffUser, "staff", IDS.barberCarlos);
  await addMember(db, IDS.nails, otherOwner, "owner");
  await db.query("insert into public.platform_admins (user_id) values ($1)", [admin]);
  await db.query("update public.subscriptions set trial_ends_at = now() - interval '1 day' where business_id = $1", [IDS.barber]);
});

describe("solicitudes de pago", () => {
  test("el monto lo calcula la base de datos (mensual y anual con adicionales)", async () => {
    const q = async (period, extra) => (await db.query("select public.premium_quote($1, $2) n", [period, extra])).rows[0].n;
    assert.equal(await q("monthly", 0), 12990);
    assert.equal(await q("monthly", 2), 12990 + 2 * 2990);
    assert.equal(await q("yearly", 1), 129900 + 2990 * 12);
  });

  test("solo dueño o administrador; validaciones; una sola pendiente; no activa Premium", async () => {
    const create = (user, extra = 1, period = "monthly") => as(db, "authenticated", user, (tx) =>
      tx.query("select public.create_payment_request($1, $2, $3, 'TRX-1') r", [IDS.barber, period, extra]));
    await assert.rejects(create(staffUser), /FORBIDDEN/);
    await assert.rejects(create(otherOwner), /FORBIDDEN/);
    await assert.rejects(create(owner, 9), /INVALID_PAYMENT_REQUEST/);
    await assert.rejects(create(owner, 1, "weekly"), /INVALID_PAYMENT_REQUEST/);
    const r = await commitAs(db, "authenticated", owner, (tx) =>
      tx.query("select public.create_payment_request($1, 'monthly', 1, 'TRX-1') r", [IDS.barber]));
    assert.equal(r.rows[0].r.amountClp, 15980);
    await assert.rejects(create(owner), /PAYMENT_REQUEST_PENDING/);
    assert.equal((await sub()).status, "past_due", "pedir no activa nada");
    await assert.rejects(as(db, "authenticated", owner, (tx) =>
      tx.query("update public.payment_requests set status = 'approved' where business_id = $1", [IDS.barber])), /permission denied/);
    const seen = await as(db, "authenticated", owner, async (tx) =>
      (await tx.query("select count(*)::int n from public.payment_requests where business_id = $1", [IDS.barber])).rows[0].n);
    assert.equal(seen, 1);
    const foreign = await as(db, "authenticated", otherOwner, async (tx) =>
      (await tx.query("select count(*)::int n from public.payment_requests where business_id = $1", [IDS.barber])).rows[0].n);
    assert.equal(foreign, 0);
  });

  test("solo un platform_admin aprueba; al aprobar se registra el pago y se activa Premium con adicionales", async () => {
    const id = (await db.query("select id from public.payment_requests where business_id = $1 and status = 'pending'", [IDS.barber])).rows[0].id;
    await assert.rejects(as(db, "authenticated", owner, (tx) =>
      tx.query("select public.admin_resolve_payment_request($1, true)", [id])), /FORBIDDEN/);
    await commitAs(db, "authenticated", admin, (tx) => tx.query("select public.admin_resolve_payment_request($1, true, 'ok')", [id]));
    assert.deepEqual(await sub(), { status: "active", extra_staff: 1, billing_period: "monthly" });
    const pay = await db.query("select amount_clp, months from public.subscription_payments where business_id = $1", [IDS.barber]);
    assert.deepEqual(pay.rows[0], { amount_clp: 15980, months: 1 });
    const max = (await db.query("select max_staff from public.business_limits($1)", [IDS.barber])).rows[0].max_staff;
    assert.equal(max, 4);
    await assert.rejects(as(db, "authenticated", admin, (tx) =>
      tx.query("select public.admin_resolve_payment_request($1, true)", [id])), /PAYMENT_REQUEST_NOT_FOUND/);
  });

  test("rechazar o cancelar no registra pagos", async () => {
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.create_payment_request($1, 'yearly', 0)", [IDS.barber]));
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.cancel_payment_request($1)", [IDS.barber]));
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.create_payment_request($1, 'yearly', 0)", [IDS.barber]));
    const id = (await db.query("select id from public.payment_requests where business_id = $1 and status = 'pending'", [IDS.barber])).rows[0].id;
    await commitAs(db, "authenticated", admin, (tx) => tx.query("select public.admin_resolve_payment_request($1, false, 'no llegó')", [id]));
    const n = (await db.query("select count(*)::int n from public.subscription_payments where business_id = $1", [IDS.barber])).rows[0].n;
    assert.equal(n, 1);
  });
});
