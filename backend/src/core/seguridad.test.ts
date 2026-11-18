import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ??= "secreto-de-prueba-secreto-de-prueba-123";
process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5432/x";

const { patronAtaque, sesionCerrada } = require("./seguridad") as typeof import("./seguridad");

test("seguridad: reconoce patrones de ataque sin alarmar con texto normal (RF-SEG-02)", () => {
  assert.equal(patronAtaque("<script>alert(1)</script>"), "XSS");
  assert.equal(patronAtaque("' OR 1=1 --"), "Inyección SQL");
  assert.equal(patronAtaque("1 UNION SELECT password FROM usuarios"), "Inyección SQL");
  assert.equal(patronAtaque("../../etc/passwd"), "Recorrido de rutas");
  assert.equal(patronAtaque("${jndi:ldap://x}"), "Inyección de plantillas");
  for (const normal of ["La impresora del ambiente 204 no imprime", "No puedo ingresar a Sofia Plus desde ayer", "Error 500 en la página"])
    assert.equal(patronAtaque(normal), null, normal);
});

test("seguridad: cierre de sesiones global y por centro (RF-SEG-05)", () => {
  const ahora = Date.now();
  const estado = { emergencia: null, sesionesDesde: { global: null, centros: { "7": ahora } } };
  const antes = Math.floor((ahora - 60_000) / 1000);
  const despues = Math.floor((ahora + 1000) / 1000);
  assert.equal(sesionCerrada(estado, antes, 7), true, "sesión del centro 7 emitida antes del corte");
  assert.equal(sesionCerrada(estado, despues, 7), false, "sesión emitida después del corte");
  assert.equal(sesionCerrada(estado, antes, 8), false, "otro centro no se afecta");
  assert.equal(sesionCerrada({ ...estado, sesionesDesde: { global: ahora, centros: {} } }, antes, null), true, "corte global");
});
