// Prueba de concurrencia real (auditoría P2-03): varias reservas SIMULTÁNEAS con el mismo teléfono en un negocio de
// pruebas. Sin la migración propuesta 20261112000200, más reservas que el máximo por teléfono pueden pasar a la vez.
//
// SOLO PARA STAGING. Nunca contra producción: crea reservas reales (y luego las cancela, sin borrarlas).
//   RACE_CONFIRM=staging RACE_SUPABASE_URL=https://<staging>.supabase.co RACE_SERVICE_ROLE_KEY=... \
//     RACE_SLUG=qa-race node scripts/race-check.mjs
// El negocio debe tener un enlace que empiece con «qa-», estar publicado y tener horas libres pasado mañana.
import { createClient } from "@supabase/supabase-js";

const { RACE_CONFIRM, RACE_SUPABASE_URL: url, RACE_SERVICE_ROLE_KEY: key, RACE_SLUG: slug = "", NEXT_PUBLIC_SUPABASE_URL: prod } = process.env;
if (RACE_CONFIRM !== "staging" || !url || !key || !slug.startsWith("qa-")) {
  console.error("Falta RACE_CONFIRM=staging, RACE_SUPABASE_URL, RACE_SERVICE_ROLE_KEY o RACE_SLUG (debe empezar con «qa-»).");
  process.exit(1);
}
if (prod && new URL(prod).host === new URL(url).host) {
  console.error("RACE_SUPABASE_URL es el mismo proyecto de NEXT_PUBLIC_SUPABASE_URL: se cancela por seguridad.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: shop, error: shopError } = await db.from("businesses").select("id, max_active_per_phone").eq("slug", slug).single();
if (shopError || !shop) throw new Error(`No existe el negocio ${slug}`);
const { data: service } = await db.from("services").select("id").eq("business_id", shop.id).eq("is_active", true).limit(1).single();
const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const { data: slots } = await db.rpc("available_slots", { p_slug: slug, p_service_id: service.id, p_date: date, p_staff_id: null });
const times = [...new Set((slots ?? []).map((s) => s.slot_time))].filter((_, i) => i % 4 === 0).slice(0, shop.max_active_per_phone + 3);
if (times.length <= shop.max_active_per_phone) throw new Error("No hay suficientes horas libres para la prueba.");

const phone = `+56 9 ${String(Date.now()).slice(-8, -4)} ${String(Date.now()).slice(-4)}`;
console.log(`Enviando ${times.length} reservas simultáneas con el mismo teléfono (máximo permitido: ${shop.max_active_per_phone})…`);
const results = await Promise.all(times.map((t) => db.rpc("create_public_booking", {
  p_slug: slug, p_service_id: service.id, p_staff_id: null, p_date: date, p_time: t, p_client_name: "QA Concurrencia", p_client_phone: phone,
})));
const created = results.filter((r) => !r.error).map((r) => r.data?.[0]?.booking_id).filter(Boolean);
const rejected = results.filter((r) => r.error).map((r) => r.error.message.match(/[A-Z_]{6,}/)?.[0] ?? "ERROR");
console.log(`Aceptadas: ${created.length} · Rechazadas: ${rejected.join(", ") || "ninguna"}`);
console.log(created.length > shop.max_active_per_phone
  ? `RESULTADO: CARRERA DEMOSTRADA (${created.length} > ${shop.max_active_per_phone}).`
  : "RESULTADO: el máximo se respetó en esta ejecución (repetir varias veces; una sola corrida no prueba la ausencia de carrera).");

if (created.length) {
  await db.from("bookings").update({ status: "cancelled" }).in("id", created);
  console.log(`Limpieza: ${created.length} reservas de prueba canceladas (no borradas).`);
}
