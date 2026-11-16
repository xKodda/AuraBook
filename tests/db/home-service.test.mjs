// Servicios a domicilio y foto de portada (migración 20261116000000): recargo y traslado calculados en la base,
// horas disponibles que respetan el traslado, dirección del cliente y permisos de configuración.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let tuesday;
let owner;

const slots = (serviceId) => as(db, "anon", null, (tx) => tx.query(
  "select slot_time from public.available_slots('barber-studio', $1, $2::date, $3)", [serviceId, tuesday, IDS.barberCarlos],
)).then((r) => r.rows.map((x) => x.slot_time));
const book = (serviceId, time, phone) => commitAs(db, "service_role", null, (tx) => tx.query(
  "select * from public.create_public_booking('barber-studio', $1, $2, $3::date, $4, 'Cliente Prueba', $5)",
  [serviceId, IDS.barberCarlos, tuesday, time, phone],
)).then((r) => r.rows[0].booking_id);
const booking = async (id) => (await db.query(
  `select at_home, price_clp, home_fee_clp, client_address, client_address_ref,
     to_char(block_end_at at time zone 'America/Santiago', 'HH24:MI') block_end
   from public.bookings where id = $1`, [id])).rows[0];
const configure = (enabled, fee, travel, area = null) => commitAs(db, "authenticated", owner, (tx) =>
  tx.query("select public.update_home_service($1, $2, $3, $4, $5)", [IDS.barber, enabled, fee, travel, area]));

before(async () => {
  db = await freshDb();
  tuesday = await nextWeekday(db, 2);
  owner = await createUser(db);
  await addMember(db, IDS.barber, owner, "owner");
});

describe("configuración", () => {
  test("solo el equipo del negocio activa la opción, con valores válidos", async () => {
    const other = await createUser(db);
    await assert.rejects(as(db, "authenticated", other, (tx) =>
      tx.query("select public.update_home_service($1, true, 0, 0, null)", [IDS.barber])), /FORBIDDEN/);
    await assert.rejects(configure(true, 3000, 7), /INVALID_HOME_SERVICE/, "el traslado va en múltiplos de 5");
    await assert.rejects(configure(true, -1, 30), /INVALID_HOME_SERVICE/);
    await assert.rejects(configure(true, 0, 30, "<b>Providencia</b>"), /INVALID_HOME_SERVICE/);
    await assert.rejects(as(db, "authenticated", other, (tx) =>
      tx.query("select public.set_service_at_home($1, true)", [IDS.barberCut])), /FORBIDDEN/);

    await configure(true, 3000, 30, "  Providencia   y Ñuñoa ");
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.set_service_at_home($1, true)", [IDS.barberCut]));
    const { rows } = await db.query("select home_service, home_fee_clp, home_travel_min, home_area from public.businesses where id = $1", [IDS.barber]);
    assert.deepEqual(rows[0], { home_service: true, home_fee_clp: 3000, home_travel_min: 30, home_area: "Providencia y Ñuñoa" });
  });
});

describe("reservas a domicilio", () => {
  let homeBooking;

  test("suman el recargo al precio y bloquean el traslado después de la cita", async () => {
    homeBooking = await book(IDS.barberCut, "10:00", "+56 9 7000 0001");
    assert.deepEqual(await booking(homeBooking), {
      at_home: true, price_clp: 15000, home_fee_clp: 3000, client_address: null, client_address_ref: null, block_end: "11:00",
    });
  });

  test("durante el traslado no se ofrecen horas; justo al terminar, sí", async () => {
    const local = await slots(IDS.barberBeardTrim);
    for (const t of ["10:00", "10:15", "10:30", "10:45"]) assert.ok(!local.includes(t), `${t} debería estar bloqueada`);
    assert.ok(local.includes("11:00"));
    await assert.rejects(book(IDS.barberBeardTrim, "10:30", "+56 9 7000 0002"), /SLOT_UNAVAILABLE/);
  });

  test("una cita a domicilio necesita su traslado libre antes de la siguiente cita", async () => {
    await book(IDS.barberBeardTrim, "12:00", "+56 9 7000 0003");
    const home = await slots(IDS.barberCut);
    assert.ok(home.includes("11:00"), "11:00–11:30 + 30 min de traslado termina justo a las 12:00");
    assert.ok(!home.includes("11:15"), "11:15 terminaría el traslado a las 12:15, encima de la cita de las 12:00");
  });

  test("la dirección se guarda una vez, solo en reservas a domicilio y sin HTML ni enlaces", async () => {
    const setAddress = (id, address, ref = null) => commitAs(db, "service_role", null, (tx) =>
      tx.query("select public.set_public_booking_address($1, $2, $3)", [id, address, ref]));
    await assert.rejects(setAddress(homeBooking, "<script>x</script> 123"), /INVALID_ADDRESS/);
    await assert.rejects(setAddress(homeBooking, "Ver https://x.cl"), /INVALID_ADDRESS/);
    await setAddress(homeBooking, "  Av. Italia   1450, Providencia ", "Depto 302, timbre 2");
    const b = await booking(homeBooking);
    assert.deepEqual([b.client_address, b.client_address_ref], ["Av. Italia 1450, Providencia", "Depto 302, timbre 2"]);
    await assert.rejects(setAddress(homeBooking, "Otra dirección 999"), /INVALID_BOOKING/, "no se puede cambiar después");

    const localId = (await db.query("select id from public.bookings where not at_home limit 1")).rows[0].id;
    await assert.rejects(setAddress(localId, "Av. Italia 1450"), /INVALID_BOOKING/);
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(as(db, role, role === "anon" ? null : owner, (tx) =>
        tx.query("select public.set_public_booking_address($1, 'Calle 123', null)", [homeBooking])), /permission denied/);
    }
  });

  test("el aviso al negocio y su panel incluyen la dirección", async () => {
    const n = (await db.query("select public.booking_notification($1) n", [homeBooking])).rows[0].n;
    assert.deepEqual([n.atHome, n.homeFeeClp, n.clientAddress, n.clientAddressRef],
      [true, 3000, "Av. Italia 1450, Providencia", "Depto 302, timbre 2"]);
    const row = await as(db, "authenticated", owner, async (tx) => (await tx.query(
      "select at_home, home_fee_clp, client_address, client_address_ref from public.bookings where id = $1", [homeBooking])).rows[0]);
    assert.equal(row.client_address, "Av. Italia 1450, Providencia");
  });

  test("con la opción desactivada, un servicio marcado se reserva como en el local", async () => {
    await configure(false, 3000, 30);
    const id = await book(IDS.barberCut, "16:00", "+56 9 7000 0004");
    assert.deepEqual(await booking(id), {
      at_home: false, price_clp: 12000, home_fee_clp: 0, client_address: null, client_address_ref: null, block_end: "16:30",
    });
  });
});

describe("foto de portada", () => {
  test("solo se acepta una imagen de la carpeta del propio negocio", async () => {
    const good = `https://abcd.supabase.co/storage/v1/object/public/business-logos/${IDS.barber}/cover-1.webp`;
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.set_business_cover($1, $2)", [IDS.barber, good]));
    assert.equal((await db.query("select cover_url from public.businesses where id = $1", [IDS.barber])).rows[0].cover_url, good);
    for (const bad of [
      `https://abcd.supabase.co/storage/v1/object/public/business-logos/${IDS.nails}/cover.webp`,
      "https://otro-sitio.cl/foto.webp",
      `https://abcd.supabase.co/storage/v1/object/public/business-logos/${IDS.barber}/cover.svg`,
    ]) {
      await assert.rejects(commitAs(db, "authenticated", owner, (tx) =>
        tx.query("select public.set_business_cover($1, $2)", [IDS.barber, bad])), /INVALID_COVER/, bad);
    }
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.set_business_cover($1, null)", [IDS.barber]));
  });
});
