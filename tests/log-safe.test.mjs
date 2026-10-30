// P1-07 (auditoría): los logs no deben contener datos personales de clientes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { redact, safeError } from "../lib/log-safe.ts";
import {
  clientConfirmationEmail, clientReminderEmail, ownerCancellationEmail, businessPublishedEmail, ownerNewBookingEmail, paymentRequestEmail,
} from "../lib/email-templates.ts";

const ROOT = join(import.meta.dirname, "..");
const BOOKING = {
  manageToken: "a".repeat(64), startAt: "2026-11-05T13:00:00Z", endAt: "2026-11-05T13:30:00Z", priceClp: 12000,
  clientName: "Camila Rojas", clientPhone: "+56 9 8765 4321", clientEmail: "camila@example.com", reminderOptIn: true,
  serviceName: "Corte", staffName: "Carlos", businessName: "Barber Studio", businessSlug: "barber-studio",
  businessAddress: "", businessPhone: "", timezone: "America/Santiago",
};

test("redact oculta correos, teléfonos y tokens", () => {
  const out = redact(`to: camila@example.com, phone +56 9 8765 4321, token ${"f".repeat(64)}, key re_AbCdEf123456`);
  for (const secret of ["camila@example.com", "8765 4321", "f".repeat(64), "re_AbCdEf123456"]) {
    assert.ok(!out.includes(secret), secret);
  }
  assert.match(out, /\[correo\].*\[teléfono\].*\[token\].*\[token\]/);
  assert.equal(redact("x".repeat(1000)).length, 300);
});

test("safeError resume el error sin detalles ni datos personales", () => {
  const err = Object.assign(new Error("new row violates check constraint for camila@example.com"), {
    code: "23514", details: "Failing row contains (Camila Rojas, +56987654321)",
  });
  const out = safeError(err);
  assert.equal(out, "Error [23514]: new row violates check constraint for [correo]");
  assert.ok(!out.includes("Camila") && !out.includes("56987654321"));
  assert.equal(safeError({ code: "PGRST116", message: "x", details: "Camila" }), "[PGRST116] x");
  assert.equal(safeError("texto camila@example.com"), "texto [correo]");
});

test("cada correo tiene una etiqueta para el log, distinta del asunto (que lleva el nombre del cliente)", () => {
  const mails = [
    ownerNewBookingEmail(BOOKING, "https://aurabook.cl"), ownerCancellationEmail(BOOKING, "https://aurabook.cl"),
    clientConfirmationEmail(BOOKING, "https://aurabook.cl"), clientReminderEmail(BOOKING, "https://aurabook.cl"),
    paymentRequestEmail({ businessName: "Barber Studio", businessSlug: "barber-studio", ownerEmail: "d@x.cl", period: "monthly",
      extraStaff: 0, amountClp: 12990, reference: "" }, "https://aurabook.cl"),
    businessPublishedEmail({ businessName: "Barber Studio", businessSlug: "barber-studio", category: "Barbería",
      ownerEmail: "d@x.cl" }, "https://aurabook.cl"),
  ];
  for (const m of mails) {
    assert.match(m.tag ?? "", /^[a-z_]+$/, m.subject);
    assert.ok(!m.tag.includes("Camila"));
  }
  assert.ok(mails[0].subject.includes("Camila"), "el asunto sí lleva el nombre: por eso no se registra");
});

test("el código no registra asuntos de correo ni objetos de error completos", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(ROOT, "app"));
  walk(join(ROOT, "lib"));
  const offenders = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (!/console\.(log|warn|error|info)\(/.test(line)) return;
      if (/\.subject|\.html|clientName|clientEmail|clientPhone|ownerEmail/.test(line) || /,\s*(error|e|err)\)\s*;/.test(line)) {
        offenders.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});
