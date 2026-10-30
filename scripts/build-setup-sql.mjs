// Regenera supabase/aurabook_setup.sql a partir de supabase/migrations/ (todas en una transacción).
// Uso: node scripts/build-setup-sql.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const dir = join(ROOT, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const parts = [
  `-- AuraBook · Instalación completa (${files.length} migraciones). Pegar en Supabase > SQL Editor y ejecutar UNA vez.`,
  "-- Todo corre en una transacción: si algo falla, no queda nada a medias.",
  "-- Archivo GENERADO a partir de supabase/migrations/ (no editar a mano). Úsalo solo para instalar en un proyecto vacío.",
  "begin;",
  "",
];
for (const f of files) {
  parts.push(`-- ════════ ${f} ════════`, readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trimEnd(), "");
}
parts.push("commit;", "", "select 'AuraBook instalado' as resultado;", "");
writeFileSync(join(ROOT, "supabase", "aurabook_setup.sql"), parts.join("\n"));
console.log(`aurabook_setup.sql: ${files.length} migraciones`);
