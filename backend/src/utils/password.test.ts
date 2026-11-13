import { test } from "node:test";
import assert from "node:assert/strict";
import { generarPasswordTemporal, validarPolitica } from "./password";

test("política de contraseñas (RNF-01)", () => {
  assert.deepEqual(validarPolitica("Segura#2026ok"), []);
  assert.ok(validarPolitica("corta1A!").length > 0);
  assert.ok(validarPolitica("sinmayuscula#123").some((m) => m.includes("mayúscula")));
  assert.ok(validarPolitica("SINMINUSCULA#123").some((m) => m.includes("minúscula")));
  assert.ok(validarPolitica("SinNumero#######").some((m) => m.includes("número")));
  assert.ok(validarPolitica("SinSimbolo123456").some((m) => m.includes("símbolo")));
});

test("la contraseña temporal cumple la política y es distinta cada vez", () => {
  for (let i = 0; i < 50; i++) assert.deepEqual(validarPolitica(generarPasswordTemporal()), []);
  assert.notEqual(generarPasswordTemporal(), generarPasswordTemporal());
});
