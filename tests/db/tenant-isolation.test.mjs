// Pruebas de las garantías de base de datos: aislamiento multi-tenant (RLS + RPCs),
// integridad referencial entre negocios, onboarding y prevención de reservas solapadas.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let tuesday;
let barberOwner;
let barberAdmin;
let barberStaffCarlos;
let nailsOwner;
let nailsBookingId;

const publicBooking = (tx, overrides = {}) => {
  const p = {
    slug: "barber-studio", service: IDS.barberCut, staff: IDS.barberCarlos,
    date: tuesday, time: "10:00", name: "Cliente Prueba", phone: "+56 9 1234 5678", ...overrides,
  };
  return tx.query(
    "select * from public.create_public_booking($1, $2, $3, $4::date, $5, $6, $7)",
    [p.slug, p.service, p.staff, p.date, p.time, p.name, p.phone],
  );
};

before(async () => {
  db = await freshDb();
  tuesday = await nextWeekday(db, 2);
  barberOwner = await createUser(db);
  barberAdmin = await createUser(db);
  barberStaffCarlos = await createUser(db);
  nailsOwner = await createUser(db);
  await addMember(db, IDS.barber, barberOwner, "owner");
  await addMember(db, IDS.barber, barberAdmin, "admin");
  await addMember(db, IDS.barber, barberStaffCarlos, "staff", IDS.barberCarlos);
  await addMember(db, IDS.nails, nailsOwner, "owner");

  // Reservas base: una por profesional de Barber Studio y una en Aura Nails.
  await commitAs(db, "service_role", null, async (tx) => {
    await publicBooking(tx, { time: "12:00" });
    await publicBooking(tx, { staff: IDS.barberMatias, time: "12:00" });
    const { rows } = await publicBooking(tx, {
      slug: "aura-nails", service: IDS.nailsManicure, staff: IDS.nailsValentina, time: "12:00",
    });
    nailsBookingId = rows[0].booking_id;
  });
});

describe("migraciones", () => {
  test("las tablas de disponibilidad quedan con business_id del profesional", async () => {
    const { rows } = await db.query(`
      select count(*)::int as wrong from (
        select business_id, staff_id from public.working_hours
        union all select business_id, staff_id from public.staff_breaks
      ) t join public.staff s on s.id = t.staff_id where s.business_id <> t.business_id`);
    assert.equal(rows[0].wrong, 0);
  });

  test("no se puede asociar disponibilidad a un profesional de otro negocio", async () => {
    await assert.rejects(
      db.query(
        "insert into public.time_off (staff_id, business_id, starts_at, ends_at) values ($1, $2, now(), now() + interval '1 hour')",
        [IDS.barberCarlos, IDS.nails],
      ),
      /time_off_staff_same_business/,
    );
  });

  test("una membresía no puede vincularse a un profesional de otro negocio", async () => {
    const user = await createUser(db);
    await assert.rejects(addMember(db, IDS.nails, user, "staff", IDS.barberCarlos), /business_members_staff_same_business/);
  });
});

describe("acceso anónimo", () => {
  test("lee el catálogo activo pero no reservas, membresías ni horarios internos", async () => {
    await as(db, "anon", null, async (tx) => {
      const { rows } = await tx.query("select count(*)::int as n from public.services where business_id = $1", [IDS.barber]);
      assert.ok(rows[0].n > 0);
    });
    for (const table of ["bookings", "business_members", "working_hours", "time_off", "rate_limits"]) {
      await assert.rejects(as(db, "anon", null, (tx) => tx.query(`select * from public.${table}`)), /permission denied/);
    }
  });

  test("no puede crear reservas directamente: solo el servidor con service_role", async () => {
    await assert.rejects(as(db, "anon", null, (tx) => publicBooking(tx, { time: "16:00" })), /permission denied/);
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => publicBooking(tx, { time: "16:00" })),
      /permission denied/,
    );
  });

  test("no puede crear negocios", async () => {
    await assert.rejects(
      as(db, "anon", null, (tx) => tx.query("select * from public.create_business_with_owner('X Shop', 'x-shop')")),
      /permission denied/,
    );
  });
});

describe("disponibilidad y concurrencia", () => {
  test("respeta descansos: no ofrece 14:00 ni 13:45 para un servicio de 30 min", async () => {
    const { rows } = await as(db, "anon", null, (tx) =>
      tx.query("select slot_time from public.available_slots('barber-studio', $1, $2::date, $3)", [
        IDS.barberCut, tuesday, IDS.barberCarlos,
      ]));
    const times = rows.map((r) => r.slot_time);
    assert.ok(times.includes("13:30"));
    assert.ok(!times.includes("13:45"));
    assert.ok(!times.includes("14:00"));
    assert.ok(times.includes("15:00"));
    assert.ok(!times.includes("12:00"), "12:00 ya está reservado");
  });

  test("un horario ocupado se rechaza al confirmar", async () => {
    await assert.rejects(as(db, "service_role", null, (tx) => publicBooking(tx, { time: "12:00" })), /SLOT_UNAVAILABLE/);
    await assert.rejects(as(db, "service_role", null, (tx) => publicBooking(tx, { time: "12:15" })), /SLOT_UNAVAILABLE/);
  });

  test("'cualquier profesional' asigna a quien esté libre", async () => {
    const { rows } = await as(db, "service_role", null, (tx) => publicBooking(tx, { staff: null, time: "17:00" }));
    assert.equal(rows.length, 1);
  });

  test("la restricción de exclusión impide solapamientos aunque se salte la RPC", async () => {
    await assert.rejects(
      db.query(
        `insert into public.bookings (business_id, service_id, staff_id, client_name, client_phone, price_clp, start_at, end_at)
         select business_id, service_id, staff_id, 'Directo', '+56911112222', 0, start_at + interval '10 minutes', end_at
         from public.bookings where staff_id = $1 and status = 'confirmed' limit 1`,
        [IDS.barberCarlos],
      ),
      /bookings_no_overlap/,
    );
  });
});

describe("aislamiento entre negocios", () => {
  test("el dueño de un negocio no ve reservas, equipo ni horarios de otro", async () => {
    await as(db, "authenticated", barberOwner, async (tx) => {
      const bookings = await tx.query("select business_id from public.bookings");
      assert.ok(bookings.rows.length > 0);
      assert.ok(bookings.rows.every((r) => r.business_id === IDS.barber));
      const members = await tx.query("select business_id from public.business_members");
      assert.ok(members.rows.every((r) => r.business_id === IDS.barber));
      const hours = await tx.query("select count(*)::int as n from public.working_hours where business_id = $1", [IDS.nails]);
      assert.equal(hours.rows[0].n, 0);
    });
  });

  test("no puede cambiar el estado de una reserva de otro negocio", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) =>
        tx.query("select public.panel_set_booking_status($1, 'cancelled')", [nailsBookingId])),
      /FORBIDDEN/,
    );
  });

  test("no puede crear reservas manuales en otro negocio", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) =>
        tx.query("select * from public.panel_create_booking($1, $2, $3, 'Intruso', '+56911112222', now() + interval '2 days')", [
          IDS.nails, IDS.nailsManicure, IDS.nailsValentina,
        ])),
      /FORBIDDEN/,
    );
  });

  test("no puede escribir tablas directamente", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => tx.query("update public.businesses set name = 'Hackeado' where id = $1", [IDS.nails])),
      /permission denied/,
    );
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) =>
        tx.query("insert into public.business_members (business_id, user_id, role) values ($1, $2, 'owner')", [IDS.nails, barberOwner])),
      /permission denied/,
    );
  });
});

describe("roles dentro de un negocio", () => {
  test("el profesional solo ve sus propias reservas", async () => {
    const { rows } = await as(db, "authenticated", barberStaffCarlos, (tx) => tx.query("select staff_id from public.bookings"));
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.staff_id === IDS.barberCarlos));
  });

  test("owner y admin ven todo el equipo; el profesional solo su membresía", async () => {
    for (const user of [barberOwner, barberAdmin]) {
      const { rows } = await as(db, "authenticated", user, (tx) => tx.query("select user_id from public.business_members"));
      assert.equal(rows.length, 3);
    }
    const { rows } = await as(db, "authenticated", barberStaffCarlos, (tx) => tx.query("select user_id from public.business_members"));
    assert.deepEqual(rows.map((r) => r.user_id), [barberStaffCarlos]);
  });

  test("el equipo no puede leer el token privado del cliente", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) => tx.query("select public_token from public.bookings")),
      /permission denied/,
    );
    const { rows } = await as(db, "authenticated", barberOwner, (tx) =>
      tx.query("select id, client_name, client_phone, start_at, status from public.bookings limit 1"));
    assert.equal(rows.length, 1);
  });
});

describe("reserva manual desde el panel", () => {
  const manual = (tx, staff, service, startSql, phone = "+56 9 2222 3333") =>
    tx.query(
      `select * from public.panel_create_booking($1, $2, $3, 'Cliente WhatsApp', $4, ${startSql})`,
      [IDS.barber, service, staff, phone],
    );

  test("crea la reserva y devuelve el enlace de gestión", async () => {
    const { rows } = await as(db, "authenticated", barberAdmin, (tx) =>
      manual(tx, IDS.barberCarlos, IDS.barberCut, `('${tuesday}'::date + time '18:00') at time zone 'America/Santiago'`));
    assert.match(rows[0].public_token, /^[0-9a-f]{64}$/);
  });

  test("rechaza un servicio que el profesional no ofrece", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) =>
        manual(tx, IDS.barberMatias, IDS.barberBeardTrim, `('${tuesday}'::date + time '18:00') at time zone 'America/Santiago'`)),
      /STAFF_NOT_FOUND/,
    );
  });

  test("rechaza solapamientos y teléfonos inválidos", async () => {
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) =>
        manual(tx, IDS.barberCarlos, IDS.barberCut, `('${tuesday}'::date + time '12:10') at time zone 'America/Santiago'`)),
      /SLOT_TAKEN/,
    );
    await assert.rejects(
      as(db, "authenticated", barberOwner, (tx) =>
        manual(tx, IDS.barberCarlos, IDS.barberCut, `('${tuesday}'::date + time '19:00') at time zone 'America/Santiago'`, "abc")),
      /INVALID_PHONE/,
    );
  });

  test("un profesional no puede agendar en la agenda de otro", async () => {
    await assert.rejects(
      as(db, "authenticated", barberStaffCarlos, (tx) =>
        manual(tx, IDS.barberMatias, IDS.barberCut, `('${tuesday}'::date + time '18:00') at time zone 'America/Santiago'`)),
      /FORBIDDEN/,
    );
  });
});

describe("onboarding", () => {
  const create = (tx, slug, extra = "") =>
    tx.query(`select * from public.create_business_with_owner('Nuevo Negocio', $1, 'unas'${extra})`, [slug]);

  test("crea el negocio y deja al usuario como owner", async () => {
    const user = await createUser(db);
    await as(db, "authenticated", user, async (tx) => {
      const { rows } = await create(tx, "nuevo-negocio");
      const members = await tx.query("select role from public.business_members where business_id = $1", [rows[0].business_id]);
      assert.deepEqual(members.rows, [{ role: "owner" }]);
    });
  });

  test("exige correo verificado", async () => {
    const user = await createUser(db, { verified: false });
    await assert.rejects(as(db, "authenticated", user, (tx) => create(tx, "sin-verificar")), /EMAIL_NOT_VERIFIED/);
  });

  test("valida zona horaria, slug reservado y slug duplicado", async () => {
    const user = await createUser(db);
    await assert.rejects(
      as(db, "authenticated", user, (tx) => create(tx, "zona-mala", ", null, null, null, 'Marte/Olimpo'")),
      /INVALID_TIMEZONE/,
    );
    await assert.rejects(as(db, "authenticated", user, (tx) => create(tx, "dashboard")), /SLUG_RESERVED/);
    await assert.rejects(as(db, "authenticated", user, (tx) => create(tx, "-guion")), /INVALID_SLUG/);
    await assert.rejects(as(db, "authenticated", user, (tx) => create(tx, "barber-studio")), /SLUG_ALREADY_EXISTS/);
  });

  test("limita la cantidad de negocios por propietario", async () => {
    const user = await createUser(db);
    await assert.rejects(
      as(db, "authenticated", user, async (tx) => {
        for (const slug of ["neg-uno", "neg-dos", "neg-tres", "neg-cuatro"]) await create(tx, slug);
      }),
      /BUSINESS_LIMIT_REACHED/,
    );
  });
});
