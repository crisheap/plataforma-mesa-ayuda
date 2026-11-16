import { test } from "node:test";
import assert from "node:assert/strict";
import { grupoDeEstado, ventanaTendencia } from "./reportes.service";

test("dashboard: cada estado cae en un solo grupo (RF-ADM-06)", () => {
  assert.equal(grupoDeEstado("ABIERTO"), "POR_REALIZAR");
  assert.equal(grupoDeEstado("ASIGNADO"), "POR_REALIZAR");
  assert.equal(grupoDeEstado("EN_PROCESO"), "EN_PROCESO");
  assert.equal(grupoDeEstado("RESUELTO"), "REALIZADO");
  assert.equal(grupoDeEstado("CERRADO"), "REALIZADO");
});

test("dashboard: ventana y unidad de la tendencia", () => {
  const ahora = new Date("2026-11-16T12:00:00Z");
  const v = ventanaTendencia({}, ahora);
  assert.equal(v.unidad, "day");
  assert.equal(Math.round((v.hasta.getTime() - v.desde.getTime()) / 86_400_000), 29, "por defecto, últimos 30 días");
  assert.equal(ventanaTendencia({ desde: new Date("2026-06-01") }, ahora).unidad, "week");
  assert.equal(ventanaTendencia({ desde: new Date("2023-01-01") }, ahora).unidad, "month");
});
