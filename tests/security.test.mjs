// Seguridad en la capa de la app: validación de entradas (inyección, spam, caracteres invisibles), escape de HTML en
// los correos, fórmulas en CSV y redirecciones. Importa los módulos reales de lib/.
import test from "node:test";
import assert from "node:assert/strict";
import { bookingSchema, manageTokenSchema, panelBookingSchema, personNameSchema } from "../lib/validation.ts";
import { escapeHtml, ownerNewBookingEmail } from "../lib/email-templates.ts";
import { csvCell } from "../lib/csv.ts";
import { safeNextPath } from "../lib/redirects.ts";

const BOOKING = {
  slug: "barber-studio", serviceId: "22222222-2222-4222-8222-222222222222", staffId: null, date: "2026-11-05",
  time: "10:00", name: "Ana Pérez", phone: "+56912345678",
};

test("nombres reales: tildes, ñ, apóstrofos, guiones y espacios repetidos", () => {
  for (const ok of ["Ana", "José Muñoz", "María-José O'Higgins", "Zoë Ñúñez", "  Camila   Rojas  ", "李小龍", "Dr. Juan"]) {
    assert.equal(personNameSchema.safeParse(ok).success, true, ok);
  }
  assert.equal(personNameSchema.parse("  Camila   Rojas  "), "Camila Rojas");
});

test("nombres con HTML, enlaces, invisibles o sin letras se rechazan (spam y phishing en los avisos)", () => {
  const bad = [
    "<script>alert(1)</script>", "Ana <b>", "Visita http://estafa.cl", "https://bit.ly/x", "Gana en www.premios.com",
    "premios.com", "Ana​Pérez", "Ana‮Pérez", "Ana\u0000", "12345", "!!", "a", "x".repeat(81), "",
  ];
  for (const name of bad) {
    assert.equal(personNameSchema.safeParse(name).success, false, JSON.stringify(name));
    assert.equal(bookingSchema.safeParse({ ...BOOKING, name }).success, false, JSON.stringify(name));
  }
  assert.equal(panelBookingSchema.safeParse({
    businessId: BOOKING.serviceId, serviceId: BOOKING.serviceId, staffId: BOOKING.serviceId, date: BOOKING.date,
    time: BOOKING.time, name: "<img src=x onerror=alert(1)>", phone: BOOKING.phone,
  }).success, false);
});

test("inyección SQL en los campos de la reserva: el formato estricto no deja pasar nada fuera de lo esperado", () => {
  const sqli = ["' OR 1=1 --", "barber-studio'; drop table bookings; --", "1; select pg_sleep(10)"];
  for (const v of sqli) {
    assert.equal(bookingSchema.safeParse({ ...BOOKING, slug: v }).success, false, `slug ${v}`);
    assert.equal(bookingSchema.safeParse({ ...BOOKING, serviceId: v }).success, false, `serviceId ${v}`);
    assert.equal(bookingSchema.safeParse({ ...BOOKING, date: v }).success, false, `date ${v}`);
    assert.equal(bookingSchema.safeParse({ ...BOOKING, time: v }).success, false, `time ${v}`);
    assert.equal(bookingSchema.safeParse({ ...BOOKING, phone: v }).success, false, `phone ${v}`);
    assert.equal(manageTokenSchema.safeParse(v).success, false, `token ${v}`);
  }
  // Un nombre con comillas es válido como texto: la base lo guarda como dato (consultas parametrizadas, sin SQL dinámico).
  assert.equal(personNameSchema.safeParse("Robert'); DROP TABLE bookings;--").success, true);
});

test("tamaños: campos enormes y tipos inesperados se rechazan", () => {
  assert.equal(bookingSchema.safeParse({ ...BOOKING, email: `${"a".repeat(250)}@x.cl` }).success, false);
  assert.equal(bookingSchema.safeParse({ ...BOOKING, captchaToken: "x".repeat(5000) }).success, false);
  assert.equal(bookingSchema.safeParse({ ...BOOKING, name: { $ne: "" } }).success, false);
  assert.equal(bookingSchema.safeParse({ ...BOOKING, reminder: "true" }).success, false);
  assert.equal(bookingSchema.safeParse({ ...BOOKING, phone: "+56 9 1234 5678 9999 9999" }).success, false);
});

test("los correos escapan todo lo que viene del cliente o del negocio", () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  const mail = ownerNewBookingEmail({
    manageToken: "t", startAt: "2026-11-05T13:00:00Z", endAt: "2026-11-05T13:30:00Z", priceClp: 12000,
    clientName: "<script>alert(1)</script>", clientPhone: "+56912345678", clientEmail: "a@b.cl", reminderOptIn: false,
    serviceName: "<img src=x onerror=alert(1)>", staffName: "Carlos", businessName: "Barber \"Studio\"", businessSlug: "barber-studio",
    businessAddress: "", businessPhone: "", timezone: "America/Santiago",
  }, "https://aurabook.clikium.cl");
  assert.ok(!mail.html.includes("<script>"), "sin <script> en el HTML");
  assert.ok(!mail.html.includes("<img src=x"), "sin etiquetas del servicio");
  assert.ok(mail.html.includes("&lt;script&gt;"));
});

test("CSV: las celdas que parecen fórmulas no se ejecutan en Excel", () => {
  for (const v of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)"]) {
    assert.ok(!/^[=+\-@]/.test(csvCell(v).replace(/^"/, "")), v);
  }
});

test("redirecciones: solo rutas internas (sin open redirect)", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "http:/evil.com"]) {
    assert.equal(safeNextPath(bad), "/dashboard", bad);
  }
  assert.equal(safeNextPath("/dashboard/plan?x=1"), "/dashboard/plan?x=1");
});
