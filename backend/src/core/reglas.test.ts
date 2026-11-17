import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarCambioEstado, formatearNumeroCaso, puedeVerCaso } from "./reglas";

const base = { rol: "USUARIO" as const, esCreador: false, esTecnicoAsignado: false };

test("el técnico asignado inicia y resuelve; otro técnico no", () => {
  assert.deepEqual(
    evaluarCambioEstado({ ...base, rol: "TECNICO", estadoActual: "ASIGNADO", destino: "EN_PROCESO", esTecnicoAsignado: true }),
    { ok: true, accion: "INICIAR" },
  );
  assert.deepEqual(
    evaluarCambioEstado({ ...base, rol: "TECNICO", estadoActual: "EN_PROCESO", destino: "RESUELTO", esTecnicoAsignado: true }),
    { ok: true, accion: "RESOLVER" },
  );
  assert.equal(evaluarCambioEstado({ ...base, rol: "TECNICO", estadoActual: "ASIGNADO", destino: "EN_PROCESO" }).ok, false);
});

test("el creador puede cerrar y rechazar la solución (RF-CAS-12)", () => {
  assert.deepEqual(evaluarCambioEstado({ ...base, esCreador: true, estadoActual: "RESUELTO", destino: "CERRADO" }), {
    ok: true,
    accion: "CERRAR",
  });
  assert.deepEqual(evaluarCambioEstado({ ...base, esCreador: true, estadoActual: "RESUELTO", destino: "EN_PROCESO" }), {
    ok: true,
    accion: "RECHAZAR",
  });
});

test("supervisor y administrador cierran; un usuario ajeno no", () => {
  assert.equal(evaluarCambioEstado({ ...base, rol: "SUPERVISOR", estadoActual: "RESUELTO", destino: "CERRADO" }).ok, true);
  assert.equal(evaluarCambioEstado({ ...base, rol: "ADMINISTRADOR", estadoActual: "RESUELTO", destino: "CERRADO" }).ok, true);
  assert.equal(evaluarCambioEstado({ ...base, estadoActual: "RESUELTO", destino: "CERRADO" }).ok, false);
});

test("un caso cerrado no admite cambios y no se salta estados", () => {
  assert.equal(evaluarCambioEstado({ ...base, rol: "ADMINISTRADOR", estadoActual: "CERRADO", destino: "EN_PROCESO" }).ok, false);
  assert.equal(
    evaluarCambioEstado({ ...base, rol: "TECNICO", esTecnicoAsignado: true, estadoActual: "ASIGNADO", destino: "RESUELTO" }).ok,
    false,
  );
  assert.equal(
    evaluarCambioEstado({ ...base, rol: "TECNICO", esTecnicoAsignado: true, estadoActual: "ABIERTO", destino: "EN_PROCESO" }).ok,
    false,
  );
  assert.equal(
    evaluarCambioEstado({ ...base, rol: "TECNICO", esTecnicoAsignado: true, estadoActual: "EN_PROCESO", destino: "EN_PROCESO" }).ok,
    false,
  );
});

test("control de propiedad (H-05) y de centro (RF-CEN-02)", () => {
  const caso = { usuarioId: 10, tecnicoId: 20, centroId: 1 };
  assert.equal(puedeVerCaso({ userId: 10, rol: "USUARIO", centroId: 1 }, caso), true);
  assert.equal(puedeVerCaso({ userId: 11, rol: "USUARIO", centroId: 1 }, caso), false);
  assert.equal(puedeVerCaso({ userId: 20, rol: "TECNICO", centroId: 1 }, caso), true);
  assert.equal(puedeVerCaso({ userId: 21, rol: "TECNICO", centroId: 1 }, caso), false);
  assert.equal(puedeVerCaso({ userId: 1, rol: "SUPERVISOR", centroId: 1 }, caso), true);
  assert.equal(puedeVerCaso({ userId: 2, rol: "ADMINISTRADOR", centroId: 1 }, caso), true);
  assert.equal(puedeVerCaso({ userId: 3, rol: "SUPERVISOR", centroId: 2 }, caso), false, "supervisor de otro centro");
  assert.equal(puedeVerCaso({ userId: 4, rol: "ADMINISTRADOR", centroId: 2 }, caso), false, "administrador de otro centro");
  assert.equal(puedeVerCaso({ userId: 5, rol: "ADMINISTRADOR", centroId: null }, caso), true, "administrador general");
  assert.equal(puedeVerCaso({ userId: 6, rol: "SUPERVISOR", centroId: null }, caso), false, "sin centro y no general: falla cerrada");
});

test("formato del número de caso con el código del centro", () => {
  assert.equal(formatearNumeroCaso("CEET", 2026, 7), "CEET-2026-000007");
  assert.equal(formatearNumeroCaso("CMTC", 2027, 123456), "CMTC-2027-123456");
});
