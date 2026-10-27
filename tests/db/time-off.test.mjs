// Bloqueos de agenda (migración 20261105000000).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let tuesday;
let barberOwner;
let barberStaffCarlos;
let nailsOwner;

const at = (time) => `('${tuesday}'::date + time '${time}') at time zone 'America/Santiago'`;
const block = (tx, staffIds, from, to, reason = "Trámite") =>
  tx.query(`select public.save_time_off($1, $2::uuid[], ${at(from)}, ${at(to)}, $3) affected`, [IDS.barber, staffIds, reason]);
const publicSlots = async (tx) => {
  await tx.exec("set local role anon");
  const { rows } = await tx.query(
    "select staff_id, slot_time from public.available_slots('barber-studio', $1, $2::date)", [IDS.barberCut, tuesday]);
  await tx.exec("set local role authenticated");
  return rows;
};

before(async () => {
  db = await freshDb();
  tuesday = await nextWeekday(db, 2);
  barberOwner = await createUser(db);
  barberStaffCarlos = await createUser(db);
  nailsOwner = await createUser(db);
  await addMember(db, IDS.barber, barberOwner, "owner");
  await addMember(db, IDS.barber, barberStaffCarlos, "staff", IDS.barberCarlos);
  await addMember(db, IDS.nails, nailsOwner, "owner");
  // Una reserva de Carlos a las 16:00, para contar las afectadas.
  await commitAs(db, "authenticated", barberOwner, (tx) => tx.query(
    `select * from public.panel_create_booking($1, $2, $3, 'Cliente', '+56 9 1111 2222', ${at("16:00")})`,
    [IDS.barber, IDS.barberCut, IDS.barberCarlos]));
});

describe("bloqueos de agenda", () => {
  test("bloquear quita esas horas de la página pública y avisa las reservas afectadas", async () => {
    const [affected, slots] = await as(db, "authenticated", barberOwner, async (tx) => {
      const { rows } = await block(tx, [IDS.barberCarlos], "15:00", "17:00");
      return [rows[0].affected, await publicSlots(tx)];
    });
    assert.equal(affected, 1);
    const carlos = slots.filter((s) => s.staff_id === IDS.barberCarlos).map((s) => s.slot_time);
    assert.ok(!carlos.includes("15:30") && !carlos.includes("16:30"));
    assert.ok(slots.some((s) => s.staff_id === IDS.barberMatias && s.slot_time === "15:30"), "Matías sigue disponible");
  });

  test("todo el equipo: un bloqueo por profesional, y se quitan juntos", async () => {
    await as(db, "authenticated", barberOwner, async (tx) => {
      await block(tx, [IDS.barberCarlos, IDS.barberMatias], "00:00", "23:59", "Feriado");
      const { rows } = await tx.query("select id from public.time_off where business_id = $1 and reason = 'Feriado'", [IDS.barber]);
      assert.equal(rows.length, 2);
      assert.equal((await publicSlots(tx)).length, 0);
      const del = await tx.query("select public.delete_time_off($1, $2::uuid[]) n", [IDS.barber, rows.map((r) => r.id)]);
      assert.equal(del.rows[0].n, 2);
      assert.ok((await publicSlots(tx)).length > 0);
    });
  });

  test("valida fechas, motivo y profesionales del negocio", async () => {
    const owner = (fn) => as(db, "authenticated", barberOwner, fn);
    await assert.rejects(owner((tx) => block(tx, [IDS.barberCarlos], "17:00", "15:00")), /INVALID_TIME_OFF/);
    await assert.rejects(owner((tx) => block(tx, [IDS.barberCarlos], "15:00", "17:00", "x".repeat(81))), /INVALID_TIME_OFF/);
    await assert.rejects(owner((tx) => block(tx, [IDS.nailsValentina], "15:00", "17:00")), /STAFF_NOT_FOUND/);
    await assert.rejects(owner((tx) => block(tx, [], "15:00", "17:00")), /STAFF_NOT_FOUND/);
  });

  test("un profesional u otro negocio no pueden crear ni quitar bloqueos", async () => {
    await assert.rejects(as(db, "authenticated", barberStaffCarlos, (tx) => block(tx, [IDS.barberCarlos], "15:00", "17:00")), /FORBIDDEN/);
    await assert.rejects(as(db, "authenticated", nailsOwner, (tx) => block(tx, [IDS.barberCarlos], "15:00", "17:00")), /FORBIDDEN/);
    const id = await commitAs(db, "authenticated", barberOwner, async (tx) => {
      await block(tx, [IDS.barberCarlos], "18:00", "19:00", "Para borrar");
      return (await tx.query("select id from public.time_off where reason = 'Para borrar'")).rows[0].id;
    });
    await assert.rejects(as(db, "authenticated", nailsOwner, (tx) => tx.query("select public.delete_time_off($1, array[$2]::uuid[])", [IDS.nails, id])), /TIME_OFF_NOT_FOUND/);
    await assert.rejects(as(db, "authenticated", barberStaffCarlos, (tx) => tx.query("select public.delete_time_off($1, array[$2]::uuid[])", [IDS.barber, id])), /FORBIDDEN/);
  });

  test("el equipo ve los bloqueos de su negocio", async () => {
    const { rows } = await as(db, "authenticated", barberStaffCarlos, (tx) =>
      tx.query("select reason from public.time_off where business_id = $1", [IDS.barber]));
    assert.ok(rows.some((r) => r.reason === "Para borrar"));
  });
});
