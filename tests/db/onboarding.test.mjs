// Flujo completo de onboarding en BD: crear negocio → equipo → horario → servicios → publicar → reservable.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let owner;
let outsider;
let businessId;
let staffId;
let serviceId;

const WEEK = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday, opens: "10:00", closes: "18:00", break_start: "13:00", break_end: "14:00",
}));

const call = (tx, sql, params) => tx.query(sql, params);

before(async () => {
  db = await freshDb();
  owner = await createUser(db);
  outsider = await createUser(db);
  await addMember(db, IDS.barber, outsider, "owner");
  await commitAs(db, "authenticated", owner, async (tx) => {
    const { rows } = await call(tx, "select * from public.create_business_with_owner('Estudio Prueba', 'estudio-prueba', 'unas')");
    businessId = rows[0].business_id;
  });
});

describe("negocio sin publicar", () => {
  test("no es visible ni reservable para el público", async () => {
    const { rows } = await as(db, "anon", null, (tx) => call(tx, "select id from public.businesses where slug = 'estudio-prueba'"));
    assert.equal(rows.length, 0);
  });

  test("el slug ya no está disponible y los reservados tampoco", async () => {
    const { rows } = await as(db, "authenticated", owner, (tx) =>
      call(tx, "select public.slug_available('estudio-prueba') a, public.slug_available('otro-estudio') b, public.slug_available('dashboard') c"));
    assert.deepEqual(rows[0], { a: false, b: true, c: false });
  });

  test("no se puede publicar incompleto", async () => {
    await assert.rejects(
      as(db, "authenticated", owner, (tx) => call(tx, "select public.complete_onboarding($1)", [businessId])),
      /NEEDS_STAFF/,
    );
  });
});

describe("configuración paso a paso", () => {
  test("perfil: el owner lo edita, un tercero no", async () => {
    await commitAs(db, "authenticated", owner, (tx) =>
      call(tx, "select public.update_business_profile($1, 'Estudio Prueba', 'unas', 'Uñas sin apuro', 'Descripción', 'Calle 1', '+56911112222')", [businessId]));
    await assert.rejects(
      as(db, "authenticated", outsider, (tx) =>
        call(tx, "select public.update_business_profile($1, 'Hack', 'unas', null, null, null, null)", [businessId])),
      /FORBIDDEN/,
    );
  });

  test("equipo: crea profesional vinculado al owner", async () => {
    await commitAs(db, "authenticated", owner, async (tx) => {
      const { rows } = await call(tx, "select public.save_staff($1, null, 'Valeria', 'Manicurista', true) as id", [businessId]);
      staffId = rows[0].id;
    });
    const { rows } = await db.query("select staff_id from public.business_members where user_id = $1", [owner]);
    assert.equal(rows[0].staff_id, staffId);
  });

  test("horario: valida y reemplaza jornada y descanso", async () => {
    for (const bad of [
      [{ weekday: 1, opens: "18:00", closes: "10:00" }],
      [{ weekday: 1, opens: "10:00", closes: "18:00", break_start: "09:00", break_end: "10:30" }],
      [{ weekday: 1, opens: "10:00", closes: "18:00", break_start: "13:00" }],
      [{ weekday: 1, opens: "10:00", closes: "18:00" }, { weekday: 1, opens: "11:00", closes: "12:00" }],
      [{ weekday: 7, opens: "10:00", closes: "18:00" }],
      [{ weekday: 1, opens: "25:00", closes: "26:00" }],
    ]) {
      await assert.rejects(
        as(db, "authenticated", owner, (tx) =>
          call(tx, "select public.set_weekly_schedule($1, $2, $3::jsonb)", [businessId, [staffId], JSON.stringify(bad)])),
        /INVALID_SCHEDULE/,
        JSON.stringify(bad),
      );
    }
    await commitAs(db, "authenticated", owner, (tx) =>
      call(tx, "select public.set_weekly_schedule($1, $2, $3::jsonb)", [businessId, [staffId], JSON.stringify(WEEK)]));
    const hours = await db.query("select count(*)::int n from public.working_hours where staff_id = $1", [staffId]);
    const breaks = await db.query("select count(*)::int n from public.staff_breaks where staff_id = $1", [staffId]);
    assert.deepEqual([hours.rows[0].n, breaks.rows[0].n], [5, 5]);
  });

  test("horario: no acepta profesionales de otro negocio", async () => {
    await assert.rejects(
      as(db, "authenticated", owner, (tx) =>
        call(tx, "select public.set_weekly_schedule($1, $2, $3::jsonb)", [businessId, [IDS.barberCarlos], JSON.stringify(WEEK)])),
      /STAFF_NOT_FOUND/,
    );
  });

  test("servicios: valida duración, precio y profesionales", async () => {
    const save = (tx, duration, price, staff) =>
      call(tx, "select public.save_service($1, null, 'Manicure', null, $2, $3, $4)", [businessId, price, duration, staff]);
    await assert.rejects(as(db, "authenticated", owner, (tx) => save(tx, 20, 10000, [staffId])), /INVALID_DURATION/);
    await assert.rejects(as(db, "authenticated", owner, (tx) => save(tx, 60, -1, [staffId])), /INVALID_PRICE/);
    await assert.rejects(as(db, "authenticated", owner, (tx) => save(tx, 60, 10000, [])), /NEEDS_STAFF/);
    await assert.rejects(as(db, "authenticated", owner, (tx) => save(tx, 60, 10000, [IDS.barberCarlos])), /STAFF_NOT_FOUND/);
    await commitAs(db, "authenticated", owner, async (tx) => {
      const { rows } = await save(tx, 60, 18000, [staffId]);
      serviceId = rows[0].save_service;
    });
    assert.ok(serviceId);
  });

  test("un tercero no puede tocar el equipo ni los servicios", async () => {
    await assert.rejects(
      as(db, "authenticated", outsider, (tx) => call(tx, "select public.save_staff($1, null, 'Intruso')", [businessId])),
      /FORBIDDEN/,
    );
    await assert.rejects(
      as(db, "authenticated", outsider, (tx) => call(tx, "select public.archive_service($1, $2)", [businessId, serviceId])),
      /FORBIDDEN/,
    );
  });
});

describe("publicación", () => {
  test("un admin no puede publicar; el owner sí", async () => {
    const admin = await createUser(db);
    await addMember(db, businessId, admin, "admin");
    await assert.rejects(
      as(db, "authenticated", admin, (tx) => call(tx, "select public.complete_onboarding($1)", [businessId])),
      /FORBIDDEN/,
    );
    const { rows } = await commitAs(db, "authenticated", owner, (tx) =>
      call(tx, "select public.complete_onboarding($1) as slug", [businessId]));
    assert.equal(rows[0].slug, "estudio-prueba");
  });

  test("ya publicado, el público ve el negocio y puede reservar", async () => {
    const tuesday = await nextWeekday(db, 2);
    const slots = await as(db, "anon", null, (tx) =>
      call(tx, "select slot_time from public.available_slots('estudio-prueba', $1, $2::date)", [serviceId, tuesday]));
    const times = slots.rows.map((r) => r.slot_time);
    assert.ok(times.includes("10:00"));
    assert.ok(!times.includes("12:30"), "12:30 + 60 min invade el descanso");
    assert.ok(!times.includes("17:30"), "17:30 + 60 min supera el cierre");
    const booking = await as(db, "service_role", null, (tx) =>
      call(tx, "select * from public.create_public_booking('estudio-prueba', $1, null, $2::date, '10:00', 'Ana', '+56912345678')", [
        serviceId, tuesday,
      ]));
    assert.equal(booking.rows[0].assigned_staff_id, staffId);
  });

  test("no se puede archivar un profesional con reservas futuras", async () => {
    const tuesday = await nextWeekday(db, 2);
    await commitAs(db, "service_role", null, (tx) =>
      call(tx, "select * from public.create_public_booking('estudio-prueba', $1, null, $2::date, '11:00', 'Ana', '+56912345678')", [
        serviceId, tuesday,
      ]));
    await assert.rejects(
      as(db, "authenticated", owner, (tx) => call(tx, "select public.archive_staff($1, $2)", [businessId, staffId])),
      /STAFF_HAS_UPCOMING_BOOKINGS/,
    );
  });
});
