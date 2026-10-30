// Avisos push: cada usuario maneja solo sus suscripciones; el servidor obtiene los destinos de una reserva
// (dueños y administradores del negocio, nunca de otro negocio) y limpia las que dejaron de existir.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb } from "./supabase-harness.mjs";

let db;
let owner;
let admin;
let staffUser;
let otherOwner;
let bookingId;

const KEY = "B".repeat(87);
const AUTH = "a".repeat(22);
const endpoint = (name) => `https://push.example.com/send/${name}`;
const save = (tx, ep, p256dh = KEY, auth = AUTH) =>
  tx.query("select public.save_push_subscription($1, $2, $3, 'Mozilla/5.0 (Android)')", [ep, p256dh, auth]);
const targets = (id) => as(db, "service_role", null, async (tx) =>
  (await tx.query("select endpoint from public.booking_push_targets($1) order by 1", [id])).rows.map((r) => r.endpoint));
const count = async (ep) =>
  (await db.query("select count(*)::int n from public.push_subscriptions where endpoint = $1", [ep])).rows[0].n;

before(async () => {
  db = await freshDb();
  owner = await createUser(db);
  admin = await createUser(db);
  staffUser = await createUser(db);
  otherOwner = await createUser(db);
  await addMember(db, IDS.barber, owner, "owner");
  await addMember(db, IDS.barber, admin, "admin");
  await addMember(db, IDS.barber, staffUser, "staff", IDS.barberCarlos);
  await addMember(db, IDS.nails, otherOwner, "owner");
  const { rows } = await db.query(
    `insert into public.bookings (business_id, service_id, staff_id, client_name, client_phone, price_clp, start_at, end_at)
     values ($1, $2, $3, 'Cliente', '+56911112222', 12000, now() + interval '2 days', now() + interval '2 days 30 minutes')
     returning id`,
    [IDS.barber, IDS.barberCut, IDS.barberCarlos],
  );
  bookingId = rows[0].id;
  for (const [user, name] of [[owner, "owner"], [admin, "admin"], [staffUser, "staff"], [otherOwner, "other"]]) {
    await commitAs(db, "authenticated", user, (tx) => save(tx, endpoint(name)));
  }
});

describe("suscripciones del usuario", () => {
  test("nadie lee ni escribe la tabla directamente", async () => {
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(as(db, role, owner, (tx) => tx.query("select * from public.push_subscriptions")), /permission denied/);
      await assert.rejects(as(db, role, owner, (tx) => tx.query(
        "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ($1, 'https://x', $2, $3)",
        [owner, KEY, AUTH])), /permission denied/);
    }
  });

  test("un anónimo no puede guardar suscripciones", async () => {
    await assert.rejects(as(db, "anon", null, (tx) => save(tx, endpoint("anon"))), /permission denied/);
  });

  test("rechaza suscripciones mal formadas", async () => {
    for (const [ep, key, auth] of [["http://inseguro.com/x", KEY, AUTH], [endpoint("corta"), "x", AUTH], [endpoint("auth"), KEY, ""]]) {
      await assert.rejects(as(db, "authenticated", owner, (tx) => save(tx, ep, key, auth)), /INVALID_SUBSCRIPTION/);
    }
  });

  test("borrar una suscripción ajena no hace nada", async () => {
    await commitAs(db, "authenticated", otherOwner, (tx) => tx.query("select public.delete_push_subscription($1)", [endpoint("owner")]));
    assert.equal(await count(endpoint("owner")), 1);
  });

  test("guarda como máximo 10 navegadores por usuario", async () => {
    const user = await createUser(db);
    for (let i = 0; i < 12; i++) await commitAs(db, "authenticated", user, (tx) => save(tx, endpoint(`many-${i}`)));
    const { rows } = await db.query("select count(*)::int n from public.push_subscriptions where user_id = $1", [user]);
    assert.equal(rows[0].n, 10);
    assert.equal(await count(endpoint("many-0")), 0);
    assert.equal(await count(endpoint("many-11")), 1);
  });
});

describe("destinos y resultados (servidor)", () => {
  test("un usuario no puede pedir destinos ni registrar resultados", async () => {
    await assert.rejects(as(db, "authenticated", owner, (tx) => tx.query("select * from public.booking_push_targets($1)", [bookingId])),
      /permission denied/);
    await assert.rejects(as(db, "authenticated", owner, (tx) =>
      tx.query("select public.record_push_result($1, false, true)", [endpoint("other")])), /permission denied/);
  });

  test("avisa a dueños y administradores del negocio de la reserva, no al equipo ni a otros negocios", async () => {
    assert.deepEqual(await targets(bookingId), [endpoint("admin"), endpoint("owner")]);
  });

  test("una suscripción que ya no existe se borra; un éxito reinicia los fallos", async () => {
    const ep = endpoint("gone");
    await commitAs(db, "authenticated", owner, (tx) => save(tx, ep));
    await commitAs(db, "service_role", null, (tx) => tx.query("select public.record_push_result($1, false, true)", [ep]));
    assert.equal(await count(ep), 0);

    const flaky = endpoint("flaky");
    await commitAs(db, "authenticated", owner, (tx) => save(tx, flaky));
    for (let i = 0; i < 4; i++) {
      await commitAs(db, "service_role", null, (tx) => tx.query("select public.record_push_result($1, false, false)", [flaky]));
    }
    await commitAs(db, "service_role", null, (tx) => tx.query("select public.record_push_result($1, true, false)", [flaky]));
    const { rows } = await db.query("select failure_count, last_success_at from public.push_subscriptions where endpoint = $1", [flaky]);
    assert.equal(rows[0].failure_count, 0);
    assert.ok(rows[0].last_success_at);
    for (let i = 0; i < 5; i++) {
      await commitAs(db, "service_role", null, (tx) => tx.query("select public.record_push_result($1, false, false)", [flaky]));
    }
    assert.equal(await count(flaky), 0);
  });

  test("al eliminar la cuenta se borran sus suscripciones", async () => {
    const user = await createUser(db);
    await commitAs(db, "authenticated", user, (tx) => save(tx, endpoint("deleted-user")));
    await db.query("delete from auth.users where id = $1", [user]);
    assert.equal(await count(endpoint("deleted-user")), 0);
  });
});
