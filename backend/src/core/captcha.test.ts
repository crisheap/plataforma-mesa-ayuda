import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ??= "secreto-de-prueba-secreto-de-prueba-123";
process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5432/x";
process.env.CAPTCHA_BITS = "6";

const { cerosIniciales, emitirDesafio, resolverDesafio, verificarCaptcha } = require("./captcha") as typeof import("./captcha");

test("captcha: cuenta los bits en cero al inicio", () => {
  assert.equal(cerosIniciales(Buffer.from([0x00, 0x00, 0xff])), 16);
  assert.equal(cerosIniciales(Buffer.from([0x0f])), 4);
  assert.equal(cerosIniciales(Buffer.from([0x80])), 0);
});

test("captcha: una solución válida pasa una sola vez (RF-SEG-01)", () => {
  const d = emitirDesafio("10.0.0.1");
  assert.equal(d.bits, 6);
  const nonce = resolverDesafio(d.desafio, d.bits);
  verificarCaptcha({ desafio: d.desafio, firma: d.firma, nonce });
  assert.throws(() => verificarCaptcha({ desafio: d.desafio, firma: d.firma, nonce }), /ya se usó/);
});

test("captcha: rechaza firma alterada, dificultad rebajada y nonce que no resuelve", () => {
  const d = emitirDesafio();
  const nonce = resolverDesafio(d.desafio, d.bits);
  assert.throws(() => verificarCaptcha({ desafio: d.desafio, firma: `${d.firma.slice(0, -2)}xx`, nonce }), /no es válida/);
  const [sal, vence] = d.desafio.split(".");
  const facil = `${sal}.${vence}.0`;
  assert.throws(() => verificarCaptcha({ desafio: facil, firma: d.firma, nonce: "0" }), /no es válida/, "no se puede bajar la dificultad");
  let malo = 0;
  while (cerosIniciales(require("node:crypto").createHash("sha256").update(`${d.desafio}:${malo}`).digest()) >= d.bits) malo++;
  assert.throws(() => verificarCaptcha({ desafio: d.desafio, firma: d.firma, nonce: String(malo) }), /no es válida/);
  assert.throws(() => verificarCaptcha(undefined), /Falta/);
});
