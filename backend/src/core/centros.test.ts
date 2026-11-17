import { test } from "node:test";
import assert from "node:assert/strict";
import { CODIGO_CENTRO, esGeneral, filtroCentro, puedeGestionar, rolesGestionables } from "./centros";

const general = { userId: 1, rol: "ADMINISTRADOR" as const, centroId: null };
const adminCeet = { userId: 2, rol: "ADMINISTRADOR" as const, centroId: 10 };
const supCeet = { userId: 3, rol: "SUPERVISOR" as const, centroId: 10 };

test("centros: solo el administrador sin centro es el general", () => {
  assert.equal(esGeneral(general), true);
  assert.equal(esGeneral(adminCeet), false);
  assert.equal(esGeneral({ rol: "SUPERVISOR", centroId: null }), false);
});

test("centros: filtro de consultas", () => {
  assert.deepEqual(filtroCentro(general), {});
  assert.deepEqual(filtroCentro(general, 11), { centroId: 11 });
  assert.deepEqual(filtroCentro(adminCeet, 11), { centroId: 10 }, "un centro no puede pedir otro");
  assert.deepEqual(filtroCentro(supCeet), { centroId: 10 });
  assert.deepEqual(filtroCentro({ rol: "TECNICO", centroId: null }), { centroId: -1 });
});

test("centros: quién gestiona a quién (RF-CEN-03)", () => {
  assert.deepEqual(rolesGestionables(adminCeet), ["USUARIO", "TECNICO", "SUPERVISOR"]);
  assert.ok(rolesGestionables(general).includes("ADMINISTRADOR"));
  assert.equal(puedeGestionar(adminCeet, { id: 9, rol: "TECNICO", centroId: 10 }), true);
  assert.equal(puedeGestionar(adminCeet, { id: 9, rol: "TECNICO", centroId: 11 }), false, "otro centro");
  assert.equal(puedeGestionar(adminCeet, { id: 9, rol: "ADMINISTRADOR", centroId: 10 }), false, "otro administrador");
  assert.equal(puedeGestionar(general, { id: 9, rol: "ADMINISTRADOR", centroId: 11 }), true);
  assert.equal(puedeGestionar(adminCeet, { id: 1, rol: "ADMINISTRADOR", centroId: null }), false, "nadie toca al general");
});

test("centros: formato del código", () => {
  for (const c of ["CEET", "CMTC", "CNN", "C9"]) assert.ok(CODIGO_CENTRO.test(c), c);
  for (const c of ["ceet", "9ABC", "C", "CENTRO-1", "ABCDEFGHIJK"]) assert.ok(!CODIGO_CENTRO.test(c), c);
});
