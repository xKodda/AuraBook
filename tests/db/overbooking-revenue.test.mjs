// Sobrecupos en reservas manuales e ingresos por rango (migración 20261101000000).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let tuesday;
let barberOwner;
let barberStaffCarlos;
let nailsOwner;

const at = (time) => `('${tuesday}'::date + time '${time}') at time zone 'America/Santiago'`;
const manual = (tx, time, overbook, staff = IDS.barberCarlos) =>
  tx.query(
    `select * from public.panel_create_booking($1, $2, $3, 'Cliente Sobrecupo', '+56 9 2222 3333', ${at(time)}, null, $4)`,
    [IDS.barber, IDS.barberCut, staff, overbook],
  );
const revenue = (tx, from, to) =>
  tx.query("select day::text, total_clp::int, bookings from public.panel_revenue($1, $2::date, $3::date)", [IDS.barber, from, to]);

before(async () => {
  db = await freshDb();
  tuesday = await nextWeekday(db, 2);
  barberOwner = await createUser(db);
  barberStaffCarlos = await createUser(db);
  nailsOwner = await createUser(db);
  await addMember(db, IDS.barber, barberOwner, "owner");
  await addMember(db, IDS.barber, barberStaffCarlos, "staff", IDS.barberCarlos);
  await addMember(db, IDS.nails, nailsOwner, "owner");

  // Base: Carlos 12:00 y Matías 12:00 (confirmadas) y Carlos 15:00 (luego cancelada).
  await commitAs(db, "authenticated", barberOwner, async (tx) => {
    await manual(tx, "12:00", false);
    await manual(tx, "12:00", false, IDS.barberMatias);
    const { rows } = await manual(tx, "15:00", false);
    await tx.query("select public.panel_set_booking_status($1, 'cancelled')", [rows[0].booking_id]);
  });
});

describe("sobrecupo", () => {
  test("sin sobrecupo, una hora ocupada se rechaza", async () => {
    await assert.rejects(as(db, "authenticated", barberOwner, (tx) => manual(tx, "12:00", false)), /SLOT_TAKEN/);
  });

  test("con sobrecupo, la reserva se guarda marcada", async () => {
    const rows = await as(db, "authenticated", barberOwner, async (tx) => {
      const { rows: created } = await manual(tx, "12:00", true);
      const { rows: found } = await tx.query("select is_overbook, status from public.bookings where id = $1", [created[0].booking_id]);
      return found;
    });
    assert.deepEqual(rows[0], { is_overbook: true, status: "confirmed" });
  });

  test("un sobrecupo sigue ocupando la hora en la página pública", async () => {
    const publicSlots = async (tx) => {
      await tx.exec("set local role anon"); // la consulta la hace la página pública
      const { rows } = await tx.query(
        "select slot_time from public.available_slots('barber-studio', $1, $2::date, $3)",
        [IDS.barberCut, tuesday, IDS.barberCarlos],
      );
      await tx.exec("set local role authenticated");
      return rows.map((r) => r.slot_time);
    };
    const [freeBefore, freeAfter] = await as(db, "authenticated", barberOwner, async (tx) => {
      const free = await publicSlots(tx);
      await manual(tx, "17:00", true);
      return [free, await publicSlots(tx)];
    });
    assert.ok(freeBefore.includes("17:00"));
    assert.ok(!freeAfter.includes("17:00"));
  });

  test("un profesional no puede poner sobrecupos en la agenda de otro", async () => {
    await assert.rejects(
      as(db, "authenticated", barberStaffCarlos, (tx) => manual(tx, "12:00", true, IDS.barberMatias)),
      /FORBIDDEN/,
    );
  });
});

describe("ingresos por rango", () => {
  test("suma confirmadas y completadas, no las canceladas", async () => {
    const { rows } = await as(db, "authenticated", barberOwner, (tx) => revenue(tx, tuesday, tuesday));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].day, tuesday);
    assert.equal(rows[0].bookings, 2);
  });

  test("un profesional solo suma sus propias reservas", async () => {
    const { rows } = await as(db, "authenticated", barberStaffCarlos, (tx) => revenue(tx, tuesday, tuesday));
    assert.equal(rows[0].bookings, 1);
  });

  test("otro negocio no ve ingresos ajenos", async () => {
    const { rows } = await as(db, "authenticated", nailsOwner, (tx) => revenue(tx, tuesday, tuesday));
    assert.equal(rows.length, 0);
  });

  test("rangos invertidos o mayores a un año no devuelven nada", async () => {
    const result = await as(db, "authenticated", barberOwner, async (tx) => [
      (await revenue(tx, tuesday, "2020-01-01")).rows.length,
      (await tx.query("select * from public.panel_revenue($1, $2::date - 400, $2::date)", [IDS.barber, tuesday])).rows.length,
    ]);
    assert.deepEqual(result, [0, 0]);
  });
});
