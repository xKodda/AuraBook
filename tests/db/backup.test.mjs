// Respaldo de emergencia (scripts/backup.mjs y scripts/restore.mjs): ninguna tabla queda fuera, la estructura
// (aurabook_setup.sql) está al día con las migraciones y un respaldo se restaura completo en una base nueva.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { EXCLUDED_TABLES, ORDER_COLUMNS, ROOT, backupTables, migrationTables, restoreSql } from "../../scripts/backup-lib.mjs";
import { IDS, freshDb } from "./supabase-harness.mjs";

let source;

/** Lo mismo que entrega scripts/backup.mjs, leído directo de la base de prueba. */
async function dumpOf(db) {
  const tables = {};
  for (const t of backupTables()) {
    tables[t] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) rows from public.${t} x`)).rows[0].rows;
  }
  return { manifest: { createdAt: "prueba", commit: "prueba", migrations: [] }, tables };
}

/** Filas de cada tabla, ordenadas, para comparar dos bases. */
async function snapshot(db) {
  const out = {};
  for (const t of backupTables()) {
    const { rows } = await db.query(`select to_jsonb(x)::text r from public.${t} x`);
    out[t] = rows.map((r) => r.r).sort();
  }
  return out;
}

before(async () => {
  source = await freshDb();
});

describe("cobertura", () => {
  test("toda tabla de las migraciones se respalda o está excluida a propósito, y existe en la base", async () => {
    const real = (await source.query(
      "select table_name t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")).rows.map((r) => r.t);
    assert.deepEqual(migrationTables(), real);
    for (const t of Object.keys(EXCLUDED_TABLES)) assert.ok(real.includes(t), t);
    assert.ok(backupTables().length >= 18);
  });

  test("las tablas sin columna id tienen un orden definido para descargarse por páginas", async () => {
    const withId = new Set((await source.query(
      "select table_name t from information_schema.columns where table_schema = 'public' and column_name = 'id'")).rows.map((r) => r.t));
    for (const t of backupTables()) assert.ok(withId.has(t) || ORDER_COLUMNS[t], `${t} necesita ORDER_COLUMNS`);
  });

  test("aurabook_setup.sql (la estructura del respaldo) está al día con supabase/migrations", () => {
    execFileSync(process.execPath, [join(ROOT, "scripts", "build-setup-sql.mjs"), "--check"], { stdio: "pipe" });
  });
});

describe("restauración", () => {
  test("un respaldo se restaura completo sobre una base con otros datos, y los triggers siguen activos después", async () => {
    // Datos propios de la base respaldada: un negocio publicado (con suscripción y cupo de fundador) y cambios.
    const id = (await source.query("insert into public.businesses (slug, name, is_active) values ('respaldo-uno', 'Respaldo Uno', false) returning id")).rows[0].id;
    await source.query("update public.businesses set onboarding_completed_at = now(), is_active = true where id = $1", [id]);
    await source.query("update public.services set name = 'Corte de respaldo' where id = $1", [IDS.barberCut]);
    const dump = await dumpOf(source);
    const sql = restoreSql(dump);

    // La base de destino tiene datos distintos que deben desaparecer.
    const target = await freshDb();
    await target.query("insert into public.businesses (slug, name, is_active) values ('sobra-en-destino', 'Sobra', true)");
    await target.query("delete from public.staff_services where service_id = $1", [IDS.barberBeardTrim]);

    await target.exec(sql);
    assert.deepEqual(await snapshot(target), await snapshot(source));
    assert.equal((await target.query("select current_setting('session_replication_role') r")).rows[0].r, "origin");

    // Los triggers vuelven a funcionar: un negocio nuevo recibe su suscripción.
    const fresh = (await target.query("insert into public.businesses (slug, name) values ('despues-de-restaurar', 'Después') returning id")).rows[0].id;
    assert.equal((await target.query("select count(*)::int n from public.subscriptions where business_id = $1", [fresh])).rows[0].n, 1);
  });

  test("puede cambiar la dirección del proyecto en los enlaces de los logos", () => {
    const dump = {
      manifest: { createdAt: "x", commit: "x", migrations: [] },
      tables: { businesses: [{ logo_url: "https://viejo.supabase.co/storage/v1/object/public/business-logos/a/logo.png" }] },
    };
    const sql = restoreSql(dump, { replaceUrl: { from: "https://viejo.supabase.co", to: "https://nuevo.supabase.co" } });
    assert.ok(sql.includes("https://nuevo.supabase.co/storage/v1/object/public/business-logos/a/logo.png"));
    assert.ok(!sql.includes("viejo.supabase.co"));
  });
});
