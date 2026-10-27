// Eliminar un negocio desde «Mi cuenta» (migración 20261106000000).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let barberOwner;
let barberAdmin;
let nailsOwner;

const count = async (table, column = "business_id") =>
  (await db.query(`select count(*)::int n from public.${table} where ${column} = $1`, [IDS.barber])).rows[0].n;

before(async () => {
  db = await freshDb();
  const tuesday = await nextWeekday(db, 2);
  barberOwner = await createUser(db);
  barberAdmin = await createUser(db);
  nailsOwner = await createUser(db);
  await addMember(db, IDS.barber, barberOwner, "owner");
  await addMember(db, IDS.barber, barberAdmin, "admin");
  await addMember(db, IDS.nails, nailsOwner, "owner");
  await commitAs(db, "authenticated", barberOwner, (tx) => tx.query(
    `select * from public.panel_create_booking($1, $2, $3, 'Cliente', '+56 9 1111 2222', ('${tuesday}'::date + time '12:00') at time zone 'America/Santiago')`,
    [IDS.barber, IDS.barberCut, IDS.barberCarlos]));
  await db.query("update public.subscriptions set paid_until = now() + interval '10 days' where business_id = $1", [IDS.barber]);
  await db.query(`insert into public.subscription_payments (business_id, amount_clp, paid_at, months, period_start, period_end, method)
    values ($1, 15990, current_date, 1, now(), now() + interval '1 month', 'transferencia')`, [IDS.barber]);
});

describe("eliminar negocio", () => {
  test("solo el dueño puede, y debe escribir el enlace exacto", async () => {
    await assert.rejects(as(db, "authenticated", barberAdmin, (tx) => tx.query("select public.delete_business($1, 'barber-studio')", [IDS.barber])), /FORBIDDEN/);
    await assert.rejects(as(db, "authenticated", nailsOwner, (tx) => tx.query("select public.delete_business($1, 'barber-studio')", [IDS.barber])), /FORBIDDEN/);
    await assert.rejects(as(db, "authenticated", barberOwner, (tx) => tx.query("select public.delete_business($1, 'otro')", [IDS.barber])), /CONFIRMATION_MISMATCH/);
  });

  test("borra lo operativo, conserva pagos y anonimiza el negocio", async () => {
    const result = await commitAs(db, "authenticated", barberOwner, async (tx) =>
      (await tx.query("select public.delete_business($1, ' Barber-Studio ') r", [IDS.barber])).rows[0].r);
    assert.deepEqual(result, { logoUrl: null, remainingBusinesses: 0 });
    for (const t of ["bookings", "staff", "services", "working_hours", "staff_breaks", "time_off", "business_members"]) {
      assert.equal(await count(t), 0, `${t} debe quedar vacía`);
    }
    assert.equal(await count("subscription_payments"), 1, "el pago se conserva");
    const { rows } = await db.query("select name, slug, is_active, phone, deleted_at is not null deleted from public.businesses where id = $1", [IDS.barber]);
    assert.equal(rows[0].name, "Negocio eliminado");
    assert.match(rows[0].slug, /^eliminado-[0-9a-f]{12}$/);
    assert.equal(rows[0].is_active, false);
    assert.equal(rows[0].phone, null);
    assert.equal(rows[0].deleted, true);
    const sub = await db.query("select cancelled_at is not null c from public.subscriptions where business_id = $1", [IDS.barber]);
    assert.equal(sub.rows[0].c, true);
  });

  test("la página pública desaparece, el enlace queda libre y no se puede eliminar dos veces", async () => {
    const plan = await as(db, "anon", null, async (tx) => (await tx.query("select public.public_business_plan('barber-studio') p")).rows[0].p);
    assert.deepEqual(plan.staffIds, []);
    const free = await as(db, "authenticated", nailsOwner, async (tx) => (await tx.query("select public.slug_available('barber-studio') ok")).rows[0].ok);
    assert.equal(free, true);
    await assert.rejects(as(db, "authenticated", barberOwner, (tx) => tx.query("select public.delete_business($1, 'barber-studio')", [IDS.barber])), /FORBIDDEN/);
  });

  test("otro negocio no se ve afectado", async () => {
    const { rows } = await db.query("select count(*)::int n from public.staff where business_id = $1", [IDS.nails]);
    assert.ok(rows[0].n > 0);
  });
});
