// Notificaciones: correo opcional del cliente, datos para el aviso al dueño y recordatorios del día siguiente.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let owner;
let webBookingId;

/** Inserta una reserva directa (sin pasar por disponibilidad) a `daysAhead` días, 12:00 hora de Chile. */
async function insertBooking({ daysAhead, email = "cliente@test.cl", optIn = true, staff = IDS.barberCarlos, hour = 12 }) {
  const { rows } = await db.query(
    `insert into public.bookings (business_id, service_id, staff_id, client_name, client_phone, price_clp,
       start_at, end_at, client_email, reminder_opt_in)
     values ($1, $2, $3, 'Cliente', '+56911112222', 12000,
       (((now() at time zone 'America/Santiago')::date + $4::int) + make_time($7, 0, 0)) at time zone 'America/Santiago',
       (((now() at time zone 'America/Santiago')::date + $4::int) + make_time($7, 30, 0)) at time zone 'America/Santiago',
       $5, $6)
     returning id`,
    [IDS.barber, IDS.barberCut, staff, daysAhead, email, optIn, hour],
  );
  return rows[0].id;
}

before(async () => {
  db = await freshDb();
  owner = await createUser(db);
  await addMember(db, IDS.barber, owner, "owner");
  const tuesday = await nextWeekday(db, 2);
  await commitAs(db, "service_role", null, async (tx) => {
    const { rows } = await tx.query(
      "select * from public.create_public_booking('barber-studio', $1, $2, $3::date, '11:00', 'Ana Pérez', '+56 9 8765 4321')",
      [IDS.barberCut, IDS.barberCarlos, tuesday],
    );
    webBookingId = rows[0].booking_id;
  });
});

describe("contacto del cliente", () => {
  test("guarda el correo normalizado y la preferencia de recordatorio", async () => {
    await commitAs(db, "service_role", null, (tx) =>
      tx.query("select public.set_public_booking_contact($1, '  Ana@Correo.CL ', true)", [webBookingId]));
    const { rows } = await db.query("select client_email, reminder_opt_in from public.bookings where id = $1", [webBookingId]);
    assert.deepEqual(rows[0], { client_email: "ana@correo.cl", reminder_opt_in: true });
  });

  test("sin correo no puede quedar suscrito al recordatorio", async () => {
    const id = await insertBooking({ daysAhead: 5, email: null, optIn: false });
    await db.query("update public.bookings set source = 'web' where id = $1", [id]);
    await as(db, "service_role", null, async (tx) => {
      await tx.query("select public.set_public_booking_contact($1, '', true)", [id]);
      const { rows } = await tx.query("select reminder_opt_in from public.bookings where id = $1", [id]);
      assert.equal(rows[0].reminder_opt_in, false);
    });
  });

  test("rechaza correos inválidos", async () => {
    await assert.rejects(
      as(db, "service_role", null, (tx) => tx.query("select public.set_public_booking_contact($1, 'no-es-correo', true)", [webBookingId])),
      /INVALID_EMAIL/,
    );
  });

  test("solo el servidor puede usar estas funciones", async () => {
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(
        as(db, role, role === "anon" ? null : owner, (tx) =>
          tx.query("select public.set_public_booking_contact($1, 'x@y.cl', true)", [webBookingId])),
        /permission denied/,
      );
      await assert.rejects(
        as(db, role, role === "anon" ? null : owner, (tx) => tx.query("select public.booking_notification($1)", [webBookingId])),
        /permission denied/,
      );
      await assert.rejects(
        as(db, role, role === "anon" ? null : owner, (tx) => tx.query("select * from public.due_reminders()")),
        /permission denied/,
      );
    }
  });
});

describe("aviso al dueño", () => {
  test("incluye los correos de los dueños y los datos de la cita", async () => {
    const { rows } = await as(db, "service_role", null, (tx) =>
      tx.query("select public.booking_notification($1) as n", [webBookingId]));
    const n = rows[0].n;
    const { rows: u } = await db.query("select email from auth.users where id = $1", [owner]);
    assert.deepEqual(n.ownerEmails, [u[0].email]);
    assert.equal(n.clientName, "Ana Pérez");
    assert.equal(n.serviceName, "Corte clásico");
    assert.equal(n.businessSlug, "barber-studio");
    assert.match(n.manageToken, /^[0-9a-f]{64}$/);
  });

  test("el equipo ve el correo del cliente pero no el token", async () => {
    await as(db, "authenticated", owner, async (tx) => {
      const { rows } = await tx.query("select client_email, reminder_opt_in from public.bookings where id = $1", [webBookingId]);
      assert.equal(rows[0].client_email, "ana@correo.cl");
    });
  });
});

describe("recordatorios", () => {
  test("solo citas de mañana, confirmadas, con correo y suscritas", async () => {
    const tomorrow = await insertBooking({ daysAhead: 1 });
    const tomorrowNoOptIn = await insertBooking({ daysAhead: 1, optIn: false, staff: IDS.barberMatias });
    const inTwoDays = await insertBooking({ daysAhead: 2 });
    const { rows } = await as(db, "service_role", null, (tx) => tx.query("select * from public.due_reminders() as id"));
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(tomorrow));
    assert.ok(!ids.includes(tomorrowNoOptIn));
    assert.ok(!ids.includes(inTwoDays));
  });

  test("cada recordatorio se reclama una sola vez y se puede liberar si el envío falla", async () => {
    const id = await insertBooking({ daysAhead: 1, staff: IDS.barberMatias, email: "otro@test.cl", hour: 14 });
    await commitAs(db, "service_role", null, async (tx) => {
      assert.equal((await tx.query("select public.claim_reminder($1) as ok", [id])).rows[0].ok, true);
      assert.equal((await tx.query("select public.claim_reminder($1) as ok", [id])).rows[0].ok, false);
      await tx.query("select public.release_reminder($1)", [id]);
      assert.equal((await tx.query("select public.claim_reminder($1) as ok", [id])).rows[0].ok, true);
    });
    const { rows } = await as(db, "service_role", null, (tx) => tx.query("select * from public.due_reminders() as id"));
    assert.ok(!rows.map((r) => r.id).includes(id));
  });

  test("una cita cancelada no recibe recordatorio", async () => {
    const id = await insertBooking({ daysAhead: 1, staff: IDS.barberMatias, email: "c@test.cl", hour: 16 });
    await db.query("update public.bookings set status = 'cancelled' where id = $1", [id]);
    const { rows } = await as(db, "service_role", null, (tx) => tx.query("select * from public.due_reminders() as id"));
    assert.ok(!rows.map((r) => r.id).includes(id));
  });
});
