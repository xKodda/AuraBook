// Estadísticas y control de ausencias (migración 20261109000000).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let tuesday;
let barberOwner;
let barberStaffCarlos;
let nailsOwner;

const at = (time) => `('${tuesday}'::date + time '${time}') at time zone 'America/Santiago'`;
const manual = (tx, time, phone, staff = IDS.barberCarlos) => tx.query(
  `select booking_id from public.panel_create_booking($1, $2, $3, 'Cliente', $4, ${at(time)})`,
  [IDS.barber, IDS.barberCut, staff, phone]);
const publicBooking = (tx, time, phone) => tx.query(
  "select * from public.create_public_booking('barber-studio', $1, $2, $3::date, $4, 'Cliente Web', $5)",
  [IDS.barberCut, IDS.barberMatias, tuesday, time, phone]);
const insights = (tx) => tx.query("select public.panel_insights($1, $2::date, $2::date) r", [IDS.barber, tuesday]);

before(async () => {
  db = await freshDb();
  tuesday = await nextWeekday(db, 2);
  barberOwner = await createUser(db);
  barberStaffCarlos = await createUser(db);
  nailsOwner = await createUser(db);
  await addMember(db, IDS.barber, barberOwner, "owner");
  await addMember(db, IDS.barber, barberStaffCarlos, "staff", IDS.barberCarlos);
  await addMember(db, IDS.nails, nailsOwner, "owner");
  // Ana (+56 9 1111 1111): 2 ausencias y 1 completada. Beto: 1 cancelada. Matías: 1 confirmada de Carla.
  await commitAs(db, "authenticated", barberOwner, async (tx) => {
    const ids = [];
    for (const [time, phone, staff] of [
      ["10:00", "+56 9 1111 1111"], ["11:00", "+56911111111"], ["12:00", "+56 9 1111-1111"],
      ["15:00", "+56 9 2222 2222"], ["16:00", "+56 9 3333 3333", IDS.barberMatias],
    ]) ids.push((await manual(tx, time, phone, staff)).rows[0].booking_id);
    for (const [id, status] of [[ids[0], "no_show"], [ids[1], "no_show"], [ids[2], "completed"], [ids[3], "cancelled"]]) {
      await tx.query("select public.panel_set_booking_status($1, $2)", [id, status]);
    }
  });
});

describe("estadísticas", () => {
  test("totales, clientes, ocupación y montos estimados", async () => {
    const r = (await as(db, "authenticated", barberOwner, insights)).rows[0].r;
    assert.deepEqual(
      [r.totals.bookings, r.totals.completed, r.totals.noShow, r.totals.cancelled, r.totals.confirmed],
      [5, 1, 2, 1, 1]);
    assert.equal(r.totals.estimatedClp, 24000, "completada + confirmada, a precio de lista");
    assert.equal(r.totals.lostClp, 24000, "valor de las ausencias");
    assert.deepEqual([r.clients.unique, r.clients.returning], [2, 1], "Ana vino más de una vez; Beto solo canceló");
    const carlos = r.byStaff.find((s) => s.staffId === IDS.barberCarlos);
    assert.equal(carlos.noShow, 2);
    assert.ok(carlos.availableMinutes > 0 && carlos.bookedMinutes === 90);
    assert.equal(r.topNoShows[0].noShows, 2);
    assert.ok(r.byHour.length > 0 && r.byService[0].name);
  });

  test("un profesional solo ve lo suyo; otro negocio no ve nada", async () => {
    const mine = (await as(db, "authenticated", barberStaffCarlos, insights)).rows[0].r;
    assert.equal(mine.totals.bookings, 4);
    await assert.rejects(as(db, "authenticated", nailsOwner, insights), /FORBIDDEN/);
  });

  test("requiere Premium", async () => {
    await db.query("update public.subscriptions set trial_ends_at = now() - interval '1 day' where business_id = $1", [IDS.barber]);
    await assert.rejects(as(db, "authenticated", barberOwner, insights), /PLAN_FEATURE_REQUIRED/);
    await db.query("update public.subscriptions set trial_ends_at = now() + interval '20 days' where business_id = $1", [IDS.barber]);
  });
});

describe("control de ausencias", () => {
  test("historial por cliente, reconociendo el teléfono escrito de distintas formas", async () => {
    const { rows } = await as(db, "authenticated", barberOwner, (tx) =>
      tx.query("select * from public.panel_client_history($1, array['+56 9 1111 1111'])", [IDS.barber]));
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].total, rows[0].completed, rows[0].no_shows], [3, 1, 2]);
  });

  test("con la política activa, la página pública rechaza a quien acumula ausencias; el panel no", async () => {
    await assert.rejects(as(db, "authenticated", barberStaffCarlos, (tx) =>
      tx.query("select public.update_no_show_policy($1, 2)", [IDS.barber])), /FORBIDDEN/);
    await commitAs(db, "authenticated", barberOwner, (tx) => tx.query("select public.update_no_show_policy($1, 2)", [IDS.barber]));
    await assert.rejects(as(db, "service_role", null, (tx) => publicBooking(tx, "17:00", "+56 9 1111 1111")), /CLIENT_BLOCKED/);
    await as(db, "service_role", null, (tx) => publicBooking(tx, "17:00", "+56 9 4444 4444"));
    await as(db, "authenticated", barberOwner, (tx) => manual(tx, "18:00", "+56 9 1111 1111"));
  });

  test("sin Premium la política no bloquea y no se puede activar", async () => {
    await db.query("update public.subscriptions set trial_ends_at = now() - interval '1 day' where business_id = $1", [IDS.barber]);
    await as(db, "service_role", null, (tx) => publicBooking(tx, "17:00", "+56 9 1111 1111"));
    await assert.rejects(as(db, "authenticated", barberOwner, (tx) =>
      tx.query("select public.update_no_show_policy($1, 3)", [IDS.barber])), /PLAN_FEATURE_REQUIRED/);
    await as(db, "authenticated", barberOwner, (tx) => tx.query("select public.update_no_show_policy($1, null)", [IDS.barber]));
  });
});
