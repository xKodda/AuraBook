// Respaldo de emergencia de AuraBook: datos, cuentas y logos del proyecto de Supabase configurado en .env.local.
// Uso: npm run backup  (equivale a node --env-file=.env.local scripts/backup.mjs)
// Crea backups/AAAA-MM-DD_HHMM/ con:
//   estructura.sql   copia de supabase/aurabook_setup.sql (todas las migraciones) para reconstruir la base
//   datos.json       filas de cada tabla de public, cuentas (sin contraseñas) y manifiesto con conteos
//   archivos/        logos de Storage
// Contiene datos personales de clientes: no se sube a Git (backups/ está en .gitignore) ni se comparte.
// Cómo restaurar: docs/RESPALDO.md.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { EXCLUDED_TABLES, ORDER_COLUMNS, ROOT, backupTables, migrationFiles } from "./backup-lib.mjs";

const PAGE = 1000;
const BUCKETS = ["business-logos"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (usa: npm run backup).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function readTable(table) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  const order = (ORDER_COLUMNS[table] ?? "id").split(",");
  const rows = [];
  for (let from = 0; from < (count ?? 0); from += PAGE) {
    let query = db.from(table).select("*");
    for (const column of order) query = query.order(column);
    const { data, error: pageError } = await query.range(from, from + PAGE - 1);
    if (pageError) throw new Error(`${table}: ${pageError.message}`);
    rows.push(...data);
  }
  if (rows.length !== (count ?? 0)) throw new Error(`${table}: se esperaban ${count} filas y llegaron ${rows.length}.`);
  return rows;
}

async function readUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`cuentas: ${error.message}`);
    users.push(...data.users.map((u) => ({
      id: u.id, email: u.email ?? null, phone: u.phone || null, email_confirmed_at: u.email_confirmed_at ?? null,
      created_at: u.created_at, user_metadata: u.user_metadata ?? {}, app_metadata: u.app_metadata ?? {},
    })));
    if (data.users.length < PAGE) return users;
  }
}

async function downloadBucket(bucket, outDir) {
  const saved = [];
  const walk = async (prefix) => {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db.storage.from(bucket).list(prefix, { limit: PAGE, offset });
      if (error) throw new Error(`${bucket}: ${error.message}`);
      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id) { await walk(path); continue; } // carpeta
        const file = await db.storage.from(bucket).download(path);
        if (file.error) throw new Error(`${bucket}/${path}: ${file.error.message}`);
        const target = join(outDir, bucket, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(await file.data.arrayBuffer()));
        saved.push(`${bucket}/${path}`);
      }
      if (data.length < PAGE) return;
    }
  };
  await walk("");
  return saved;
}

const stamp = new Date().toLocaleString("sv-SE", { timeZone: "America/Santiago" }).slice(0, 16).replace(" ", "_").replace(":", "");
const outDir = join(ROOT, "backups", stamp);
mkdirSync(outDir, { recursive: true });

const tables = {};
for (const table of backupTables()) {
  tables[table] = await readTable(table);
  console.log(`  ${table}: ${tables[table].length}`);
}
const users = await readUsers();
console.log(`  cuentas: ${users.length}`);
const files = [];
for (const bucket of BUCKETS) files.push(...await downloadBucket(bucket, join(outDir, "archivos")));
console.log(`  archivos: ${files.length}`);

let commit = "desconocido";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { /* sin git */ }
const manifest = {
  createdAt: new Date().toISOString(),
  project: new URL(url).host,
  commit,
  migrations: migrationFiles().map((f) => f.name),
  counts: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])),
  users: users.length,
  files,
  excluded: EXCLUDED_TABLES,
};
writeFileSync(join(outDir, "datos.json"), JSON.stringify({ manifest, tables, users }, null, 1));
copyFileSync(join(ROOT, "supabase", "aurabook_setup.sql"), join(outDir, "estructura.sql"));
console.log(`Respaldo listo en backups/${stamp} (contiene datos personales: guárdalo en un lugar privado).`);
