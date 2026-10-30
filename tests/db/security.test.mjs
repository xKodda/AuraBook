// Seguridad de la base de datos: auditoría de permisos (RLS, funciones privilegiadas, qué puede hacer un anónimo),
// intentos de inyección SQL contra las funciones públicas, entradas maliciosas y límite de intentos.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, addMember, as, commitAs, createUser, freshDb, nextWeekday } from "./supabase-harness.mjs";

let db;
let owner;
let day;

const SQLI = [
  "' OR '1'='1", "'; drop table public.bookings; --", "barber-studio' --", "1; select pg_sleep(5); --",
  "$$; drop table public.businesses; $$", "\\'; truncate public.staff; --",
];
const tablesIntact = async () => {
  const { rows } = await db.query(
    "select (select count(*) from public.businesses)::int b, (select count(*) from public.staff)::int s, (select count(*) from public.bookings)::int k");
  return rows[0];
};
const book = (tx, name, time = "10:00", phone = "+56 9 7777 0000") => tx.query(
  "select * from public.create_public_booking('barber-studio', $1, $2, $3::date, $4, $5, $6)",
  [IDS.barberCut, IDS.barberCarlos, day, time, name, phone]);

before(async () => {
  db = await freshDb();
  owner = await createUser(db);
  await addMember(db, IDS.barber, owner, "owner");
  day = await nextWeekday(db, 3);
});

describe("auditoría de permisos", () => {
  test("todas las tablas de public tienen RLS activado", async () => {
    const { rows } = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    assert.deepEqual(rows, []);
  });

  test("toda función SECURITY DEFINER fija search_path (evita secuestro por objetos con el mismo nombre)", async () => {
    const { rows } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    assert.deepEqual(rows, []);
  });

  test("un anónimo solo ejecuta las funciones públicas previstas", async () => {
    const { rows } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`);
    assert.deepEqual(rows.map((r) => r.proname),
      ["available_slots", "phone_digits", "premium_quote", "public_business_plan", "public_month_full", "public_plans"]);
  });

  test("un anónimo solo lee el catálogo y nadie escribe tablas directamente", async () => {
    const anon = await db.query(`select distinct table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public' order by 1`);
    assert.deepEqual(anon.rows.map((r) => `${r.table_name}:${r.privilege_type}`),
      ["businesses:SELECT", "services:SELECT", "staff:SELECT", "staff_services:SELECT"]);
    const writes = await db.query(`select table_name, privilege_type from information_schema.role_table_grants
      where grantee in ('anon', 'authenticated') and table_schema = 'public'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`);
    assert.deepEqual(writes.rows, []);
  });

  test("las funciones del servidor (reservas públicas, tokens, límites) no las ejecuta un usuario ni un anónimo", async () => {
    for (const fn of ["create_public_booking(text, uuid, uuid, date, text, text, text)", "get_booking_by_token(text)",
      "cancel_booking_by_token(text)", "hit_rate_limit(text, integer, integer)", "booking_notification(uuid)",
      "booking_push_targets(uuid)", "record_push_result(text, boolean, boolean)"]) {
      for (const role of ["anon", "authenticated"]) {
        const { rows } = await db.query(`select has_function_privilege($1, 'public.${fn}', 'execute') ok`, [role]);
        assert.equal(rows[0].ok, false, `${role} → ${fn}`);
      }
    }
  });
});

describe("inyección SQL", () => {
  test("en las funciones públicas los parámetros son datos: no hay resultados extra ni cambios", async () => {
    const before = await tablesIntact();
    for (const payload of SQLI) {
      const plan = await as(db, "anon", null, (tx) => tx.query("select public.public_business_plan($1) r", [payload]));
      assert.ok(plan.rows[0].r === null || typeof plan.rows[0].r === "object");
      await as(db, "anon", null, async (tx) => {
        const slots = await tx.query("select * from public.available_slots($1, $2, $3::date, null)", [payload, IDS.barberCut, day])
          .catch((e) => ({ rows: [], error: e }));
        assert.equal(slots.rows.length, 0, `available_slots con ${payload}`);
      });
    }
    assert.deepEqual(await tablesIntact(), before);
  });

  test("un nombre con SQL se guarda como texto literal y no ejecuta nada", async () => {
    const before = await tablesIntact();
    const name = "Robert'); DROP TABLE public.bookings;--";
    const r = await commitAs(db, "service_role", null, (tx) => book(tx, name));
    const saved = await db.query("select client_name from public.bookings where id = $1", [r.rows[0].booking_id]);
    assert.equal(saved.rows[0].client_name, name);
    assert.deepEqual(await tablesIntact(), { ...before, k: before.k + 1 });
  });

  test("el dueño no puede inyectar SQL al editar su negocio", async () => {
    await commitAs(db, "authenticated", owner, (tx) => tx.query(
      "select public.update_business_profile($1, $2, 'barberia', $3, '', '', '')",
      [IDS.barber, "Barber'; drop table public.staff; --", "x' or '1'='1"]));
    const { rows } = await db.query("select name, tagline from public.businesses where id = $1", [IDS.barber]);
    assert.equal(rows[0].name, "Barber'; drop table public.staff; --");
    assert.ok((await tablesIntact()).s > 0);
  });

  test("un token de gestión inventado o con SQL no devuelve ni cancela reservas", async () => {
    for (const token of [...SQLI, "0".repeat(64), "%", "*"]) {
      const got = await as(db, "service_role", null, (tx) => tx.query("select * from public.get_booking_by_token($1)", [token]));
      assert.equal(got.rows.length, 0, token);
    }
  });
});

describe("entradas maliciosas en reservas públicas", () => {
  test("nombres con HTML, enlaces o caracteres de control se rechazan también en la base de datos", async () => {
    for (const name of ["<script>alert(1)</script>", "Gana en http://premios.cl", "visita www.estafa.com", "Ana\u0007Pérez"]) {
      await assert.rejects(as(db, "service_role", null, (tx) => book(tx, name, "11:00")), /INVALID_NAME/, name);
    }
  });

  test("las reservas antiguas se pueden seguir cancelando aunque su nombre no cumpla la regla nueva", async () => {
    await db.query("alter table public.bookings disable trigger bookings_client_name_safe");
    const r = await commitAs(db, "service_role", null, (tx) => book(tx, "Legado <antiguo>", "12:00", "+56 9 7777 1111"));
    await db.query("alter table public.bookings enable trigger bookings_client_name_safe");
    await commitAs(db, "authenticated", owner, (tx) =>
      tx.query("select public.panel_set_booking_status($1, 'cancelled')", [r.rows[0].booking_id]));
    const st = await db.query("select status from public.bookings where id = $1", [r.rows[0].booking_id]);
    assert.equal(st.rows[0].status, "cancelled");
  });

  test("textos demasiado largos se rechazan (límites en la base de datos)", async () => {
    await assert.rejects(as(db, "service_role", null, (tx) => book(tx, "A".repeat(81), "13:00")));
    await assert.rejects(as(db, "service_role", null, (tx) => book(tx, "Ana", "13:00", "9".repeat(25))));
    await assert.rejects(as(db, "authenticated", owner, (tx) => tx.query(
      "select public.update_business_profile($1, $2, 'barberia', '', '', '', '')", [IDS.barber, "N".repeat(121)])));
  });

  test("spam de reservas con un mismo teléfono: hay un máximo de reservas activas", async () => {
    const phone = "+56 9 8888 0000";
    const times = ["09:00", "09:30", "10:30", "11:30", "15:00", "15:30", "16:00", "16:30"];
    let accepted = 0;
    let blocked = false;
    for (const t of times) {
      try {
        await commitAs(db, "service_role", null, (tx) => book(tx, "Spammer Uno", t, phone));
        accepted += 1;
      } catch (e) {
        if (/TOO_MANY_BOOKINGS/.test(e.message)) { blocked = true; break; }
      }
    }
    assert.ok(blocked, "debe bloquear al superar el máximo");
    assert.ok(accepted >= 1 && accepted < times.length);
  });
});

describe("límite de intentos (rate limit)", () => {
  test("cuenta por clave y ventana, y bloquea al superar el límite", async () => {
    const hit = async (key) => (await as(db, "service_role", null, (tx) =>
      tx.query("select public.hit_rate_limit($1, 3, 600) ok", [key]))).rows[0].ok;
    await commitAs(db, "service_role", null, (tx) => tx.query("select public.hit_rate_limit('booking:ip:1.2.3.4', 3, 600)"));
    await commitAs(db, "service_role", null, (tx) => tx.query("select public.hit_rate_limit('booking:ip:1.2.3.4', 3, 600)"));
    await commitAs(db, "service_role", null, (tx) => tx.query("select public.hit_rate_limit('booking:ip:1.2.3.4', 3, 600)"));
    assert.equal(await hit("booking:ip:1.2.3.4"), false, "el 4º intento se bloquea");
    assert.equal(await hit("booking:ip:5.6.7.8"), true, "otra IP no se ve afectada");
  });

  test("una clave enorme no rompe la tabla (se recorta)", async () => {
    const ok = await as(db, "service_role", null, (tx) => tx.query("select public.hit_rate_limit($1, 3, 600) ok", ["k".repeat(10000)]));
    assert.equal(ok.rows[0].ok, true);
  });
});
