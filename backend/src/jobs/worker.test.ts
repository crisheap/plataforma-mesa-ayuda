import { test } from "node:test";
import assert from "node:assert/strict";

test("retención del asistente: calcula la fecha de corte y se desactiva con 0", async () => {
  const { corteRetencion } = await import("./worker");
  const ahora = new Date("2026-11-14T12:00:00Z");
  assert.equal(corteRetencion(180, ahora)?.toISOString(), "2026-05-18T12:00:00.000Z");
  assert.equal(corteRetencion(1, ahora)?.toISOString(), "2026-11-13T12:00:00.000Z");
  assert.equal(corteRetencion(0, ahora), null);
  assert.equal(corteRetencion(Number.NaN, ahora), null);
});
