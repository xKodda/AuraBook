// Respaldo de emergencia: qué tablas se guardan y cómo se vuelven a cargar (scripts/backup.mjs, scripts/restore.mjs).
// La lista de tablas sale de supabase/migrations/, así una tabla nueva no puede quedar fuera del respaldo:
// tests/db/backup.test.mjs falla si una tabla no está ni respaldada ni excluida a propósito.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");

/** Tablas que no vale la pena respaldar (se regeneran solas). */
export const EXCLUDED_TABLES = {
  rate_limits: "contadores de intentos por ventana de tiempo; se vacían solos",
};

/** Clave para ordenar al descargar por páginas (tablas sin columna `id`). */
export const ORDER_COLUMNS = {
  business_members: "business_id,user_id",
  legal_acceptances: "user_id,document,version",
  platform_admins: "user_id",
  platform_settings: "id",
  staff_services: "staff_id,service_id",
  subscriptions: "business_id",
};

export function migrationFiles() {
  const dir = join(ROOT, "supabase", "migrations");
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => ({ name: f, sql: readFileSync(join(dir, f), "utf8") }));
}

/** Tablas de `public` creadas en las migraciones (y no borradas después), en orden alfabético. */
export function migrationTables() {
  const tables = new Set();
  for (const { sql } of migrationFiles()) {
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)) tables.add(m[1].toLowerCase());
    for (const m of sql.matchAll(/drop table (?:if exists )?public\.([a-z_]+)/gi)) tables.delete(m[1].toLowerCase());
  }
  return [...tables].sort();
}

export const backupTables = () => migrationTables().filter((t) => !(t in EXCLUDED_TABLES));

const DATA_TAG = "$respaldo$";
const BLOCK_TAG = "$restaurar$";

/**
 * SQL que reemplaza los datos de `public` por los del respaldo. Pensado para un proyecto recién instalado con
 * supabase/aurabook_setup.sql (o para recuperar el mismo proyecto): primero borra lo que haya en cada tabla.
 * Va en un solo bloque `do` (todo o nada): el SQL Editor de Supabase no mantiene una transacción entre instrucciones.
 * `session_replication_role = replica` desactiva triggers y llaves foráneas mientras carga, como recomienda Supabase
 * para restaurar datos; las restricciones de unicidad y de horarios sin solapar siguen activas.
 * `replaceUrl`: cambia la dirección del proyecto anterior por la nueva (logos guardados en Storage).
 */
export function restoreSql(dump, { replaceUrl } = {}) {
  const lines = [
    "-- AuraBook · Restauración de datos (GENERADO por scripts/restore.mjs).",
    `-- Respaldo del ${dump.manifest.createdAt} · commit ${dump.manifest.commit} · ${dump.manifest.migrations.length} migraciones.`,
    "-- ATENCIÓN: BORRA los datos actuales de cada tabla y carga los del respaldo. Ejecutar después de aurabook_setup.sql.",
    `do ${BLOCK_TAG}`,
    "begin",
    "  perform set_config('session_replication_role', 'replica', true);",
    "",
  ];
  for (const table of Object.keys(dump.tables).sort()) {
    let json = JSON.stringify(dump.tables[table]);
    if (replaceUrl) json = json.split(replaceUrl.from).join(replaceUrl.to);
    if (json.includes(DATA_TAG) || json.includes(BLOCK_TAG)) throw new Error(`Los datos de ${table} contienen ${DATA_TAG} o ${BLOCK_TAG}.`);
    lines.push(
      `  -- ${table}: ${dump.tables[table].length} filas`,
      `  delete from public.${table};`,
      `  insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, ${DATA_TAG}${json}${DATA_TAG}::jsonb);`,
      "",
    );
  }
  lines.push("  perform set_config('session_replication_role', 'origin', true);", "end;", `${BLOCK_TAG};`, "",
    "select 'Datos restaurados' as resultado;", "");
  return lines.join("\n");
}
