// Importa los módulos reales de lib/ (Node 22 elimina los tipos de los .ts al importar).
import test from "node:test";
import assert from "node:assert/strict";
import { bookingSchema, isValidChileanPhoneOrInternational, manageTokenSchema } from "../lib/validation.ts";
import { canManageSettings, canManageStaff, canViewAllBookings } from "../lib/permissions.ts";
import { dateInTimeZone, dateWithinBookingWindow, zonedTimeToUtc } from "../lib/dates.ts";
import { safeNextPath } from "../lib/redirects.ts";

test("Validación de números de teléfono para reservas", () => {
  for (const ok of ["+56 9 1234 5678", "+56912345678", "912345678", "+56 2 2233 4455", "+1 415 555 2671", "+54 9 11 1234 5678"]) {
    assert.equal(isValidChileanPhoneOrInternational(ok), true, ok);
  }
  for (const bad of ["123", "", "abcdef"]) {
    assert.equal(isValidChileanPhoneOrInternational(bad), false, bad);
  }
});

test("Validación de slugs multi-tenant en el esquema de reserva", () => {
  const base = {
    serviceId: "22222222-2222-4222-8222-222222222222", staffId: null, date: "2026-10-27",
    time: "10:00", name: "Ana", phone: "+56912345678",
  };
  for (const slug of ["barber-studio", "aura-nails", "salon-lumiere-providencia", "estetica123"]) {
    assert.equal(bookingSchema.safeParse({ ...base, slug }).success, true, slug);
  }
  for (const slug of ["ab", "Barber-Studio", "barber_studio", "barber studio", "barber/studio"]) {
    assert.equal(bookingSchema.safeParse({ ...base, slug }).success, false, slug);
  }
});

test("Matriz de roles y permisos SaaS (Owner, Admin, Staff)", () => {
  assert.deepEqual(
    ["owner", "admin", "staff"].map((r) => [canManageSettings(r), canManageStaff(r), canViewAllBookings(r)]),
    [[true, true, true], [false, true, true], [false, false, false]],
  );
});

test("Fecha local en America/Santiago", () => {
  // 02:00 UTC del 24-oct = 23:00 del 23-oct en Chile (UTC-3, horario de verano).
  assert.equal(dateInTimeZone(new Date("2026-10-24T02:00:00.000Z"), "America/Santiago"), "2026-10-23");
});

test("Conversión hora local → UTC a ambos lados del cambio de horario de Chile", () => {
  // El 6-sep-2026 Chile pasa de UTC-4 a UTC-3.
  assert.equal(zonedTimeToUtc("2026-09-05", "10:00", "America/Santiago").toISOString(), "2026-09-05T14:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-09-06", "10:00", "America/Santiago").toISOString(), "2026-09-06T13:00:00.000Z");
  // El 5-abr-2026 vuelve a UTC-4.
  assert.equal(zonedTimeToUtc("2026-04-04", "10:00", "America/Santiago").toISOString(), "2026-04-04T13:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-04-05", "10:00", "America/Santiago").toISOString(), "2026-04-05T14:00:00.000Z");
});

test("Ventana de reserva rechaza fechas pasadas, lejanas o inválidas", () => {
  const today = dateInTimeZone(new Date(), "America/Santiago");
  assert.equal(dateWithinBookingWindow(today, "America/Santiago", 30), true);
  assert.equal(dateWithinBookingWindow("2020-01-01", "America/Santiago", 30), false);
  assert.equal(dateWithinBookingWindow("2999-01-01", "America/Santiago", 30), false);
  assert.equal(dateWithinBookingWindow("2026-02-30", "America/Santiago", 3650), false);
});

test("Formato de token público de gestión (64 caracteres hex)", () => {
  assert.equal(manageTokenSchema.safeParse("a".repeat(64)).success, true);
  assert.equal(manageTokenSchema.safeParse("a".repeat(63)).success, false);
  assert.equal(manageTokenSchema.safeParse("z".repeat(64)).success, false);
});

test("Redirección post-login solo hacia rutas internas", () => {
  assert.equal(safeNextPath("/onboarding?paso=2"), "/onboarding?paso=2");
  assert.equal(safeNextPath(null), "/dashboard");
  for (const evil of ["https://evil.cl", "//evil.cl", "/\\evil.cl", "javascript:alert(1)", "panel"]) {
    assert.equal(safeNextPath(evil), "/dashboard", evil);
  }
});

test("Slug generado desde el nombre del negocio", async () => {
  const { slugify, isValidSlug } = await import("../lib/slug.ts");
  assert.equal(slugify("Barbería Don José"), "barberia-don-jose");
  assert.equal(slugify("  Uñas & Spa  Ñuñoa!! "), "unas-y-spa-nunoa");
  assert.equal(slugify("---"), "");
  assert.equal(slugify("a".repeat(70)).length, 60);
  assert.equal(isValidSlug(slugify("Salón Lumière")), true);
  for (const bad of ["ab", "-inicio", "fin-", "doble--guion", "Mayus"]) assert.equal(isValidSlug(bad), false, bad);
});

test("Errores de RPC se traducen a mensajes para el usuario", async () => {
  const { rpcErrorMessage } = await import("../lib/errors.ts");
  assert.match(rpcErrorMessage("SLUG_ALREADY_EXISTS"), /ya está en uso/);
  assert.match(rpcErrorMessage('P0001: NEEDS_HOURS'), /horario/);
  assert.match(rpcErrorMessage("relation does not exist"), /No pudimos guardar/);
  assert.match(rpcErrorMessage(undefined), /No pudimos guardar/);
});

test("Avisos de suscripción para el dueño (sin bloqueo)", async () => {
  const { billingAlert, daysUntil } = await import("../lib/billing.ts");
  const now = new Date("2026-10-25T12:00:00Z");
  const inDays = (d) => new Date(now.getTime() + d * 86_400_000).toISOString();
  assert.equal(daysUntil(inDays(3), now), 3);
  assert.equal(daysUntil(null, now), null);
  assert.equal(billingAlert(undefined, now), null);
  assert.equal(billingAlert({ status: "trial", endsAt: inDays(10) }, now), null);
  assert.match(billingAlert({ status: "trial", endsAt: inDays(5) }, now).message, /5 días/);
  assert.match(billingAlert({ status: "trial", endsAt: inDays(0.5) }, now).message, /hoy/);
  assert.match(billingAlert({ status: "past_due", endsAt: inDays(-2) }, now).message, /ahora estás en Free/);
  assert.equal(billingAlert({ status: "past_due", endsAt: inDays(-30) }, now), null);
  assert.equal(billingAlert({ status: "active", endsAt: inDays(20) }, now), null);
  assert.match(billingAlert({ status: "active", endsAt: inDays(3) }, now).message, /renueva en 3/);
  assert.equal(billingAlert({ status: "cancelled", endsAt: null }, now), null);
});

test("Correos de reserva: datos correctos y HTML del cliente escapado", async () => {
  const { ownerNewBookingEmail, clientConfirmationEmail, clientReminderEmail, formatWhen } = await import("../lib/email-templates.ts");
  const b = {
    manageToken: "a".repeat(64), startAt: "2026-10-27T13:30:00.000Z", endAt: "2026-10-27T14:30:00.000Z", priceClp: 13000,
    clientName: "<img src=x onerror=alert(1)> Ana", clientPhone: "+56 9 8765 4321", clientEmail: "ana@correo.cl",
    reminderOptIn: true, serviceName: "Corte de pelo", staffName: "Felipe", businessName: "BarberShop",
    businessSlug: "barbershop", businessAddress: "Calle 1", businessPhone: "", timezone: "America/Santiago",
  };
  assert.equal(formatWhen(b.startAt, b.timezone), "martes 27 de octubre, 10:30 h");
  const { ownerCancellationEmail } = await import("../lib/email-templates.ts");
  const cancelled = ownerCancellationEmail(b, "https://aurabook.clikium.cl");
  assert.match(cancelled.subject, /^Cancelación: /);
  assert.ok(!cancelled.html.includes("<img src=x"));
  assert.match(cancelled.text, /quedó libre/);
  const owner = ownerNewBookingEmail(b, "https://aurabook.clikium.cl");
  assert.ok(!owner.html.includes("<img src=x"));
  assert.ok(owner.html.includes("&lt;img"));
  assert.match(owner.html, /\$13\.000/);
  assert.match(owner.text, /ana@correo\.cl/);
  const confirm = clientConfirmationEmail(b, "https://aurabook.clikium.cl");
  assert.ok(confirm.html.includes(`https://aurabook.clikium.cl/reserva/${"a".repeat(64)}`));
  assert.match(confirm.text, /recordatorio el día antes/);
  assert.match(clientReminderEmail(b, "https://x.cl").subject, /mañana tienes hora en BarberShop/);
});

test("rangos de ingresos: meses con su último día real y semanas de lunes a domingo", async () => {
  const { monthRange, shiftMonth, weekRange, daysInRange } = await import("../lib/dates.ts");
  assert.deepEqual(monthRange("2026-10-25"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(monthRange("2026-11-30"), { from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(monthRange("2027-02-10"), { from: "2027-02-01", to: "2027-02-28" });
  assert.deepEqual(monthRange("2028-02-10"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(monthRange("2026-12-31"), { from: "2026-12-01", to: "2026-12-31" });
  assert.equal(shiftMonth("2026-01-31", 1), "2026-02-01");
  assert.equal(shiftMonth("2026-12-15", 1), "2027-01-01");
  assert.equal(shiftMonth("2026-01-15", -1), "2025-12-01");
  assert.deepEqual(weekRange("2026-10-25"), { from: "2026-10-19", to: "2026-10-25" }); // domingo
  assert.deepEqual(weekRange("2026-10-26"), { from: "2026-10-26", to: "2026-11-01" }); // lunes
  assert.equal(daysInRange("2027-02-01", "2027-02-28"), 28);
  assert.equal(daysInRange("2026-10-01", "2026-10-31"), 31);
});

test("CSV de exportación: separador chileno, comillas y sin inyección de fórmulas", async () => {
  const { csvCell, csvPhone, toCsv } = await import("../lib/csv.ts");
  assert.equal(csvCell("Ana"), "Ana");
  assert.equal(csvCell('Dice "hola"; chao'), '"Dice ""hola""; chao"');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("@SUM(1)"), "'@SUM(1)");
  assert.equal(csvCell(12990), "12990");
  assert.equal(csvCell(true), "Sí");
  assert.equal(csvCell(null), "");
  assert.equal(csvPhone("+56 9 1234 5678"), "56 9 1234 5678");
  const out = toCsv(["A", "B"], [["1", "2"]]);
  assert.ok(out.startsWith("﻿A;B\r\n1;2\r\n"));
});
