// Postgres embebido (PGlite) con lo mínimo de Supabase para probar migraciones, RLS y RPCs
// sin Docker ni credenciales. No reemplaza una prueba contra un proyecto Supabase real:
// no incluye PostgREST, GoTrue ni los grants exactos de la plataforma.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SUPABASE_STUB = `
create schema if not exists extensions;
create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Igual que Supabase: privilegios por defecto amplios en public; las migraciones deben revocarlos.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export const IDS = {
  barber: "11111111-1111-4111-8111-111111111111",
  nails: "a2000000-0000-4000-8000-000000000000",
  barberCarlos: "55555555-5555-4555-8555-555555555555",
  barberMatias: "66666666-6666-4666-8666-666666666666",
  barberCut: "22222222-2222-4222-8222-222222222222",
  barberBeardTrim: "44444444-4444-4444-8444-444444444444",
  nailsValentina: "a2000000-0000-4000-8000-000000000001",
  nailsManicure: "a2100000-0000-4000-8000-000000000001",
};

export async function freshDb() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_STUB);
  const dir = join(ROOT, "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`La migración ${file} falló: ${error.message}`);
    }
  }
  await db.exec("grant all on all tables in schema public to service_role;");
  await db.exec(readFileSync(join(ROOT, "supabase", "002_demo_seed.sql"), "utf8"));
  return db;
}

/** Crea un usuario de auth (verificado por defecto) y devuelve su id. */
export async function createUser(db, { verified = true } = {}) {
  const { rows } = await db.query(
    "insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), gen_random_uuid() || '@test.cl', $1) returning id",
    [verified ? new Date() : null],
  );
  return rows[0].id;
}

export async function addMember(db, businessId, userId, role, staffId = null) {
  await db.query(
    "insert into public.business_members (business_id, user_id, role, staff_id) values ($1, $2, $3, $4)",
    [businessId, userId, role, staffId],
  );
}

/** Ejecuta `fn` como un rol de Supabase (anon/authenticated/service_role) y revierte al terminar. */
export async function as(db, role, userId, fn) {
  let result;
  let failure;
  await db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    try {
      result = await fn(tx);
    } catch (error) {
      failure = error;
    }
    await tx.rollback();
  });
  if (failure) throw failure;
  return result;
}

/** Igual que `as`, pero confirma los cambios. */
export async function commitAs(db, role, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    return fn(tx);
  });
}

/** Próximo día (en America/Santiago) que coincide con `weekday` (0 = domingo), al menos mañana. */
export async function nextWeekday(db, weekday) {
  const { rows } = await db.query(
    `select (d)::date::text as day from generate_series(
       (now() at time zone 'America/Santiago')::date + 1,
       (now() at time zone 'America/Santiago')::date + 8, interval '1 day') d
     where extract(dow from d) = $1 limit 1`,
    [weekday],
  );
  return rows[0].day;
}
