// Configuración de despliegue: captcha (auditoría P1-06) y dominio canónico (P0-03).
import test from "node:test";
import assert from "node:assert/strict";
import { captchaConfigProblem, captchaMode } from "../lib/captcha-config.ts";
import { CANONICAL_ORIGIN, LEGACY_HOSTS, legacyHostRedirects } from "../lib/domains.ts";

test("Turnstile: dos claves = exigido, ninguna = desactivado, una sola = mal configurado", () => {
  assert.equal(captchaMode("site", "secret"), "enforced");
  assert.equal(captchaMode("", ""), "disabled");
  assert.equal(captchaMode(undefined, undefined), "disabled");
  assert.equal(captchaMode("site", ""), "misconfigured");
  assert.equal(captchaMode("", "secret"), "misconfigured");
  assert.equal(captchaMode("  ", "secret"), "misconfigured", "una clave con solo espacios cuenta como vacía");
});

test("Turnstile: el mensaje nombra la variable que falta y nunca muestra el valor de la otra", () => {
  assert.equal(captchaConfigProblem("site", "secret"), null);
  assert.equal(captchaConfigProblem("", ""), null);
  const onlySecret = captchaConfigProblem("", "valor-secreto-123");
  assert.match(onlySecret, /falta NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.ok(!onlySecret.includes("valor-secreto-123"));
  assert.match(captchaConfigProblem("pk", ""), /falta TURNSTILE_SECRET_KEY/);
});

test("dominio: aurabook.cl es el canónico y www y el subdominio anterior redirigen a él sin bucles", () => {
  assert.equal(CANONICAL_ORIGIN, "https://aurabook.cl");
  assert.deepEqual([...LEGACY_HOSTS].sort(), ["aurabook.clikium.cl", "www.aurabook.cl"]);
  assert.ok(!LEGACY_HOSTS.includes(new URL(CANONICAL_ORIGIN).host), "el canónico no puede redirigir a sí mismo");
  for (const r of legacyHostRedirects()) {
    assert.equal(r.destination, "https://aurabook.cl/:path*");
    assert.equal(r.source, "/:path*");
    assert.equal(r.permanent, true);
  }
});
