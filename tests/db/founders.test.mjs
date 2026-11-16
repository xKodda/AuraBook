// Programa Fundadores (migración 20261115000000): cupo al publicar, 6 meses de Premium, exclusiones, contador
// público, muro con consentimiento y acciones de /admin.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { as, addMember, createUser, freshDb } from "./supabase-harness.mjs";

let db;
let admin;

const create = async (slug, owner) => {
  const id = (await db.query("insert into public.businesses (slug, name, is_active) values ($1, $1, false) returning id", [slug])).rows[0].id;
  if (owner) await addMember(db, id, owner, "owner");
  return id;
};
const publish = (id) => db.query("update public.businesses set onboarding_completed_at = now(), is_active = true where id = $1", [id]);
const founder = async (id) => (await db.query(
  `select b.founder_number n, b.founder_public pub, round(extract(epoch from s.trial_ends_at - now()) / 86400) days,
     public.subscription_status(s.trial_ends_at, s.paid_until, s.cancelled_at) status
   from public.businesses b join public.subscriptions s on s.business_id = b.id where b.id = $1`, [id])).rows[0];
const summary = () => as(db, "anon", null, async (tx) => (await tx.query("select public.founders_summary() s")).rows[0].s);

before(async () => {
  db = await freshDb();
  admin = await createUser(db);
  await db.query("insert into public.platform_admins (user_id) values ($1)", [admin]);
});

describe("cupos", () => {
  test("parte con 15 cupos libres: los negocios del seed no cuentan", async () => {
    assert.deepEqual(await summary(), { total: 15, taken: 0, months: 6, wall: [] });
  });

  test("al publicar recibe el número 1 y Premium por 6 meses desde ese día", async () => {
    const id = await create("primer-fundador", await createUser(db));
    await publish(id);
    const f = await founder(id);
    assert.equal(f.n, 1);
    assert.equal(f.status, "trial");
    assert.ok(Number(f.days) >= 180 && Number(f.days) <= 184, `${f.days} días`);
    assert.equal((await summary()).taken, 1);
  });

  test("un negocio interno o de un administrador de la plataforma no ocupa cupo", async () => {
    const internal = await create("negocio-interno", await createUser(db));
    await db.query("update public.businesses set is_internal = true where id = $1", [internal]);
    await publish(internal);
    const own = await create("negocio-del-admin", admin);
    await publish(own);
    for (const id of [internal, own]) {
      const f = await founder(id);
      assert.equal(f.n, null);
      assert.equal(Number(f.days), 30, "tiene la prueba normal");
    }
    assert.equal((await summary()).taken, 1);
  });

  test("con los cupos llenos, el siguiente tiene la prueba normal de 30 días", async () => {
    await db.query("update public.platform_settings set founders_total = 1");
    const id = await create("sin-cupo", await createUser(db));
    await publish(id);
    assert.deepEqual([(await founder(id)).n, Number((await founder(id)).days)], [null, 30]);
    await db.query("update public.platform_settings set founders_total = 15");
  });
});

describe("/admin", () => {
  test("quitar el cupo lo libera y la prueba vuelve a 30 días; darlo de nuevo usa el número más bajo libre", async () => {
    const id = (await db.query("select id from public.businesses where slug = 'primer-fundador'")).rows[0].id;
    // Como el administrador, con cambios confirmados (`as` los revertiría).
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin]);
    await db.query("select public.admin_revoke_founder($1)", [id]);
    assert.deepEqual([(await founder(id)).n, Number((await founder(id)).days)], [null, 30]);
    assert.equal((await summary()).taken, 0);

    const n = (await db.query("select public.admin_grant_founder($1) n", [id])).rows[0].n;
    assert.equal(n, 1);
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  });

  test("marcar un negocio como interno le quita el cupo", async () => {
    const id = await create("se-vuelve-interno", await createUser(db));
    await publish(id);
    assert.equal((await founder(id)).n, 2);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin]);
    await db.query("select public.admin_set_business_internal($1, true)", [id]);
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    assert.equal((await founder(id)).n, null);
    await assert.rejects(
      as(db, "authenticated", admin, (tx) => tx.query("select public.admin_grant_founder($1)", [id])), /NOT_ELIGIBLE/);
  });

  test("solo un administrador de la plataforma puede usar las acciones de /admin", async () => {
    const someone = await createUser(db);
    for (const sql of ["select public.admin_founders()", "select public.admin_grant_founder(gen_random_uuid())",
      "select public.admin_revoke_founder(gen_random_uuid())", "select public.admin_set_business_internal(gen_random_uuid(), true)"]) {
      await assert.rejects(as(db, "authenticated", someone, (tx) => tx.query(sql)), /FORBIDDEN/, sql);
    }
    const data = await as(db, "authenticated", admin, async (tx) => (await tx.query("select public.admin_founders() d")).rows[0].d);
    assert.equal(data.total, 15);
    assert.ok(data.businesses.some((b) => b.ownedByAdmin && b.founderNumber === null));
  });

  test("anónimos y dueños no pueden asignar cupos directamente", async () => {
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(
        as(db, role, role === "anon" ? null : admin, (tx) => tx.query("select public.assign_founder(gen_random_uuid())")),
        /permission denied/);
    }
  });
});

describe("muro de fundadores", () => {
  test("solo aparecen quienes lo aceptan, y solo el equipo del negocio puede decidirlo", async () => {
    const owner = await createUser(db);
    const id = await create("fundador-visible", owner);
    await publish(id);
    assert.equal((await summary()).wall.length, 0);

    await assert.rejects(
      as(db, "authenticated", await createUser(db), (tx) => tx.query("select public.set_founder_public($1, true)", [id])), /FORBIDDEN/);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    await db.query("select public.set_founder_public($1, true)", [id]);
    await db.query("select set_config('request.jwt.claim.sub', '', false)");

    const wall = (await summary()).wall;
    assert.deepEqual(wall.map((w) => w.slug), ["fundador-visible"]);
    assert.ok(wall[0].number > 0);

    await db.query("update public.businesses set is_active = false where id = $1", [id]);
    assert.equal((await summary()).wall.length, 0, "un negocio despublicado no aparece");
  });
});
