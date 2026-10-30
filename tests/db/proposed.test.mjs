// Migraciones PROPUESTAS (supabase/proposed/, aún no aprobadas): se aplican sobre una base local con todas las
// migraciones vigentes y se valida su comportamiento antes de pedir que se ejecuten en producción.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

const PROPOSED = ["20261112000000_notification_outbox.sql", "20261112000100_trial_once_per_owner.sql",
  "20261112000200_booking_schedule_lock.sql"];
const apply = (db) => Promise.all([]).then(async () => {
  for (const f of PROPOSED) await db.exec(readFileSync(join(import.meta.dirname, "..", "..", "supabase", "proposed", f), "utf8"));
});

let db;
let day;
const service = (sql, params) => commitAs(db, "service_role", null, (tx) => tx.query(sql, params));
const book = (time, phone = "+56 9 4444 0001", name = "Cliente Prueba") => service(
  "select * from public.create_public_booking('barber-studio', $1, $2, $3::date, $4, $5, $6)",
  [IDS.barberCut, IDS.barberCarlos, day, time, name, phone]);

before(async () => {
  db = await freshDb();
  await apply(db);
  await apply(db); // re-ejecutables
  day = await nextWeekday(db, 3);
});

describe("propuestas: permisos", () => {
  test("no amplían lo que puede hacer un anónimo ni dan escritura directa", async () => {
    const anon = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`);
    assert.deepEqual(anon.rows.map((r) => r.proname),
      ["available_slots", "phone_digits", "premium_quote", "public_business_plan", "public_month_full", "public_plans"]);
    const noRls = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    assert.deepEqual(noRls.rows, []);
    for (const fn of ["enqueue_booking_notification(uuid, text)", "claim_booking_notification(uuid)", "trial_used_by(uuid, uuid)"]) {
      const { rows } = await db.query(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') ok`);
      assert.equal(rows[0].ok, false, fn);
    }
  });
});

describe("P1-02 · avisos persistentes", () => {
  let bookingId;
  let id;
  before(async () => {
    bookingId = (await book("12:00")).rows[0].booking_id;
  });

  test("encolar dos veces el mismo aviso no lo duplica", async () => {
    id = (await service("select public.enqueue_booking_notification($1, 'owner_new_booking') id", [bookingId])).rows[0].id;
    const again = (await service("select public.enqueue_booking_notification($1, 'owner_new_booking') id", [bookingId])).rows[0].id;
    assert.equal(again, id);
    const n = await db.query("select count(*)::int n from public.booking_notifications where booking_id = $1", [bookingId]);
    assert.equal(n.rows[0].n, 1);
  });

  test("solo un proceso puede reclamar el envío (sin correos duplicados)", async () => {
    assert.equal((await service("select public.claim_booking_notification($1) ok", [id])).rows[0].ok, true);
    assert.equal((await service("select public.claim_booking_notification($1) ok", [id])).rows[0].ok, false);
  });

  test("un error deja el aviso para reintento con espera creciente; al 5.º intento queda «dead»", async () => {
    await service("select public.finish_booking_notification($1, false, 'Resend 500 (owner_new_booking): error')", [id]);
    let row = (await db.query("select status, attempts, round(extract(epoch from next_attempt_at - now()) / 60) mins from public.booking_notifications where id = $1", [id])).rows[0];
    assert.deepEqual([row.status, row.attempts, Number(row.mins)], ["failed", 1, 5]);
    assert.equal((await service("select public.claim_booking_notification($1) ok", [id])).rows[0].ok, false, "antes de su turno no se reintenta");
    for (let i = 2; i <= 5; i++) {
      await db.query("update public.booking_notifications set next_attempt_at = now() - interval '1 second' where id = $1", [id]);
      assert.equal((await service("select public.claim_booking_notification($1) ok", [id])).rows[0].ok, true, `intento ${i}`);
      await service("select public.finish_booking_notification($1, false, 'error')", [id]);
    }
    row = (await db.query("select status, attempts from public.booking_notifications where id = $1", [id])).rows[0];
    assert.deepEqual([row.status, row.attempts], ["dead", 5]);
    await db.query("update public.booking_notifications set next_attempt_at = now() - interval '1 second' where id = $1", [id]);
    assert.equal((await service("select public.claim_booking_notification($1) ok", [id])).rows[0].ok, false);
  });

  test("éxito marca enviado; un envío cortado se puede reclamar después de 15 minutos", async () => {
    const other = (await service("select public.enqueue_booking_notification($1, 'client_confirmation') id", [bookingId])).rows[0].id;
    await service("select public.claim_booking_notification($1)", [other]);
    await db.query("update public.booking_notifications set claimed_at = now() - interval '16 minutes' where id = $1", [other]);
    const due = await service("select id from public.due_booking_notifications(10)");
    assert.ok(due.rows.some((r) => r.id === other), "aparece entre los pendientes");
    assert.equal((await service("select public.claim_booking_notification($1) ok", [other])).rows[0].ok, true);
    await service("select public.finish_booking_notification($1, true)", [other]);
    const row = (await db.query("select status, sent_at is not null sent, last_error from public.booking_notifications where id = $1", [other])).rows[0];
    assert.deepEqual(row, { status: "sent", sent: true, last_error: null });
  });
});

describe("P1-01 · una prueba por persona", () => {
  const cycle = async (user, slug) => {
    const r = await commitAs(db, "authenticated", user, (tx) => tx.query("select * from public.create_business_with_owner($1, $2, 'barberia')", [slug, slug]));
    const id = Object.values(r.rows[0])[0];
    const onboarding = (await db.query("select public.subscription_status(trial_ends_at, paid_until, cancelled_at) st from public.subscriptions where business_id = $1", [id])).rows[0].st;
    await db.query("update public.businesses set onboarding_completed_at = now(), is_active = true where id = $1", [id]);
    const published = (await db.query("select public.subscription_status(trial_ends_at, paid_until, cancelled_at) st from public.subscriptions where business_id = $1", [id])).rows[0].st;
    return { id, onboarding, published };
  };

  test("eliminar el negocio y crear otro ya no da una prueba nueva (antes: 5 de 5)", async () => {
    const u = await createUser(db);
    const first = await cycle(u, "prueba-uno");
    assert.deepEqual([first.onboarding, first.published], ["trial", "trial"]);
    await commitAs(db, "authenticated", u, (tx) => tx.query("select public.delete_business($1, 'prueba-uno')", [first.id]));
    const second = await cycle(u, "prueba-dos");
    assert.deepEqual([second.onboarding, second.published], ["past_due", "past_due"], "sin Premium ni en la configuración ni al publicar");
    const ev = await db.query("select count(*)::int n from public.subscription_events where business_id = $1 and type = 'trial_denied'", [second.id]);
    assert.equal(ev.rows[0].n, 1);
  });

  test("con el mismo correo en una cuenta nueva tampoco (la marca usa el hash del correo)", async () => {
    const email = (await db.query("select email from auth.users u join public.business_members m on m.user_id = u.id join public.businesses b on b.id = m.business_id where b.slug = 'prueba-dos'")).rows[0].email;
    const clone = (await db.query("insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), upper($1), now()) returning id", [email])).rows[0].id;
    const r = await cycle(clone, "prueba-tres");
    assert.equal(r.published, "past_due");
    const stored = await db.query("select count(*)::int n from public.trial_grants where email_hash = $1", [email]);
    assert.equal(stored.rows[0].n, 0, "no se guarda el correo en claro");
  });

  test("un dueño nuevo sí recibe su prueba, y /admin puede autorizar una excepción con registro", async () => {
    const fresh = await createUser(db);
    assert.equal((await cycle(fresh, "prueba-nueva")).published, "trial");
    const denied = (await db.query("select id from public.businesses where slug = 'prueba-tres'")).rows[0].id;
    const admin = await createUser(db);
    await db.query("insert into public.platform_admins (user_id) values ($1)", [admin]);
    await commitAs(db, "authenticated", admin, (tx) => tx.query("select public.admin_extend_trial($1, 14)", [denied]));
    const st = (await db.query("select public.subscription_status(trial_ends_at, paid_until, cancelled_at) st from public.subscriptions where business_id = $1", [denied])).rows[0].st;
    assert.equal(st, "trial");
    const ev = await db.query("select created_by from public.subscription_events where business_id = $1 and type = 'trial_extended'", [denied]);
    assert.equal(ev.rows[0].created_by, admin);
  });

  test("las pruebas ya otorgadas antes de la migración quedan anotadas", async () => {
    const owner = await createUser(db);
    await addMember(db, IDS.nails, owner, "owner");
    await db.query("update public.subscriptions set trial_started_at = now() - interval '10 days' where business_id = $1", [IDS.nails]);
    await apply(db);
    const r = await cycle(owner, "otra-de-nails");
    assert.equal(r.published, "past_due");
  });
});

describe("P2-03 y P2-04 · reservas y bloqueos serializados por negocio", () => {
  test("la reserva pública sigue funcionando igual y respeta el máximo por teléfono", async () => {
    const phone = "+56 9 4444 7777";
    const free = (await as(db, "anon", null, (tx) => tx.query(
      "select slot_time from public.available_slots('barber-studio', $1, $2::date, $3)", [IDS.barberCut, day, IDS.barberCarlos])))
      .rows.map((r) => r.slot_time).filter((t, i, all) => i % 4 === 0 && all.length).slice(0, 4);
    assert.equal(free.length, 4, "cuatro horas libres separadas");
    const results = [];
    for (const t of free) {
      try { await book(t, phone); results.push("ok"); } catch (e) { results.push(/TOO_MANY_BOOKINGS/.test(e.message) ? "max" : e.message.slice(0, 30)); }
    }
    assert.deepEqual(results, ["ok", "ok", "ok", "max"]);
  });

  test("una hora dentro de un bloqueo ya guardado no se puede reservar", async () => {
    const owner = await createUser(db);
    await addMember(db, IDS.barber, owner, "owner");
    const from = (await db.query("select (($1::date + time '16:00') at time zone 'America/Santiago') t", [day])).rows[0].t;
    const to = (await db.query("select (($1::date + time '17:00') at time zone 'America/Santiago') t", [day])).rows[0].t;
    await commitAs(db, "authenticated", owner, (tx) => tx.query("select public.save_time_off($1, $2, $3, $4, 'trámite')",
      [IDS.barber, [IDS.barberCarlos], from, to]));
    await assert.rejects(book("16:30", "+56 9 4444 8888"), /SLOT_UNAVAILABLE/);
  });

  test("el bloqueo de agenda se toma en ambas funciones (evidencia de la serialización)", async () => {
    const src = await db.query(`select proname, prosrc ~ 'aurabook:schedule:' locked from pg_proc
      where proname in ('create_public_booking', 'save_time_off') order by 1`);
    assert.deepEqual(src.rows, [{ proname: "create_public_booking", locked: true }, { proname: "save_time_off", locked: true }]);
  });
});
