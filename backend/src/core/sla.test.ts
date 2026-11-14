import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularVencimiento, minutosRestantes, semaforoSla } from "./sla";

const t0 = new Date("2026-11-02T08:00:00Z");
const caso = (o: object) => ({
  estado: "ASIGNADO" as const,
  fechaCreacion: t0,
  slaVenceEn: calcularVencimiento(t0, 100),
  fechaResolucion: null,
  ...o,
});

test("semáforo de SLA", () => {
  assert.equal(semaforoSla(caso({}), new Date(t0.getTime() + 10 * 60_000)), "EN_TIEMPO");
  assert.equal(semaforoSla(caso({}), new Date(t0.getTime() + 80 * 60_000)), "EN_RIESGO");
  assert.equal(semaforoSla(caso({}), new Date(t0.getTime() + 101 * 60_000)), "VENCIDO");
  assert.equal(semaforoSla(caso({ slaVenceEn: null })), "SIN_SLA");
});

test("casos resueltos: cumplido o incumplido", () => {
  assert.equal(semaforoSla(caso({ estado: "RESUELTO", fechaResolucion: new Date(t0.getTime() + 60 * 60_000) })), "CUMPLIDO");
  assert.equal(semaforoSla(caso({ estado: "CERRADO", fechaResolucion: new Date(t0.getTime() + 120 * 60_000) })), "INCUMPLIDO");
});

test("minutos restantes", () => {
  assert.equal(minutosRestantes(calcularVencimiento(t0, 100), new Date(t0.getTime() + 40 * 60_000)), 60);
  assert.equal(minutosRestantes(null), null);
});
