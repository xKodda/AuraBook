// Restauración de un respaldo de scripts/backup.mjs. Paso a paso en docs/RESPALDO.md.
//
//   node scripts/restore.mjs sql backups/<carpeta> [--nueva-url https://NUEVO.supabase.co]
//     Genera backups/<carpeta>/restaurar-datos.sql para pegar en el SQL Editor del proyecto (después de estructura.sql).
//     --nueva-url cambia la dirección del proyecto anterior por la nueva en los enlaces de los logos.
//
//   RESTORE_SUPABASE_URL=... RESTORE_SERVICE_ROLE_KEY=... node scripts/restore.mjs cuentas backups/<carpeta>
//     Crea las cuentas con su mismo id (sin contraseña: cada persona entra con «¿Olvidaste tu contraseña?»)
//     y vuelve a subir los logos. No borra nada: una cuenta o archivo que ya existe se deja como está.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { restoreSql } from "./backup-lib.mjs";

const [command, dir, ...rest] = process.argv.slice(2);
if (!["sql", "cuentas"].includes(command) || !dir) {
  console.error("Uso: node scripts/restore.mjs sql|cuentas backups/<carpeta> [--nueva-url URL]");
  process.exit(1);
}
const dump = JSON.parse(readFileSync(join(dir, "datos.json"), "utf8"));

if (command === "sql") {
  const i = rest.indexOf("--nueva-url");
  const to = i >= 0 ? rest[i + 1]?.replace(/\/+$/, "") : null;
  if (i >= 0 && !/^https:\/\/[^/]+$/.test(to ?? "")) {
    console.error("--nueva-url debe ser la dirección del proyecto nuevo, por ejemplo https://abcd.supabase.co");
    process.exit(1);
  }
  const sql = restoreSql(dump, to ? { replaceUrl: { from: `https://${dump.manifest.project}`, to } } : {});
  writeFileSync(join(dir, "restaurar-datos.sql"), sql);
  console.log(`Listo: ${join(dir, "restaurar-datos.sql")} (${Object.keys(dump.tables).length} tablas). Ejecútalo después de estructura.sql.`);
  process.exit(0);
}

const url = process.env.RESTORE_SUPABASE_URL;
const key = process.env.RESTORE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan RESTORE_SUPABASE_URL y RESTORE_SERVICE_ROLE_KEY (las del proyecto donde se restaura).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let created = 0;
let existing = 0;
for (const u of dump.users) {
  const { error } = await db.auth.admin.createUser({
    id: u.id, email: u.email ?? undefined, phone: u.phone ?? undefined, email_confirm: Boolean(u.email_confirmed_at),
    user_metadata: u.user_metadata, app_metadata: u.app_metadata,
  });
  if (!error) created++;
  else if (/already|exists|registered/i.test(error.message)) existing++;
  else throw new Error(`cuenta ${u.email ?? u.id}: ${error.message}`);
}
console.log(`  cuentas: ${created} creadas, ${existing} ya existían`);

// El bucket de logos solo acepta estas imágenes (20261028000000_business_branding.sql).
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
let uploaded = 0;
for (const path of dump.manifest.files) {
  const [bucket, ...parts] = path.split("/");
  const contentType = MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  const { error } = await db.storage.from(bucket)
    .upload(parts.join("/"), readFileSync(join(dir, "archivos", path)), { upsert: false, contentType });
  if (!error) uploaded++;
  else if (!/exists|duplicate/i.test(error.message)) throw new Error(`${path}: ${error.message}`);
}
console.log(`  archivos: ${uploaded} subidos de ${dump.manifest.files.length}`);
