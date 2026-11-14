/**
 * Prueba de contrato (RNF-06): toda ruta declarada en los módulos debe estar documentada
 * en el OpenAPI, y el OpenAPI no puede documentar rutas que no existen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { construirOpenApi, operacionesDocumentadas } from "./openapi";

const raiz = path.resolve(__dirname, "..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

/** Archivo de rutas → [prefijo de montaje, nombre de la variable del router]. */
const MONTAJES: [string, string, string][] = [
  ["modules/auth/auth.routes.ts", "/api/auth", "router"],
  ["modules/usuarios/usuarios.routes.ts", "/api/usuarios", "router"],
  ["modules/roles/roles.routes.ts", "/api/roles", "router"],
  ["modules/casos/casos.routes.ts", "/api/casos", "router"],
  ["modules/sla/sla.routes.ts", "/api/sla", "router"],
  ["modules/auditoria/auditoria.routes.ts", "/api/auditoria", "router"],
  ["modules/reportes/reportes.routes.ts", "/api/reportes", "router"],
  ["modules/notificaciones/notificaciones.routes.ts", "/api/notificaciones", "notificacionesRouter"],
  ["modules/notificaciones/notificaciones.routes.ts", "/api/push", "pushRouter"],
  ["modules/asistente/asistente.routes.ts", "/api/asistente", "router"],
];

function rutasDelCodigo(): Set<string> {
  const rutas = new Set<string>();
  for (const [archivo, prefijo, variable] of MONTAJES) {
    const re = new RegExp(`\\b${variable}\\.(get|post|put|patch|delete)\\(\\s*"([^"]+)"`, "g");
    for (const [, metodo, ruta] of leer(archivo).matchAll(re)) {
      rutas.add(`${metodo.toUpperCase()} ${prefijo}${ruta === "/" ? "" : ruta}`);
    }
  }
  // Rutas declaradas directamente en app.ts
  for (const [, metodo, ruta] of leer("app.ts").matchAll(/app\.(get|post)\(\s*"(\/api\/(?:health|metrics|openapi\.json))"/g)) {
    rutas.add(`${metodo.toUpperCase()} ${ruta}`);
  }
  return rutas;
}

test("cada ruta de la API está documentada en el contrato OpenAPI", () => {
  const codigo = rutasDelCodigo();
  const doc = new Set(operacionesDocumentadas());
  assert.ok(codigo.size >= 50, `se esperaban más de 50 rutas, se encontraron ${codigo.size}`);
  const sinDocumentar = [...codigo].filter((r) => !doc.has(r));
  const inexistentes = [...doc].filter((r) => !codigo.has(r));
  assert.deepEqual(sinDocumentar, [], "rutas sin documentar");
  assert.deepEqual(inexistentes, [], "rutas documentadas que no existen");
});

test("el contrato OpenAPI es coherente", () => {
  const d = construirOpenApi();
  const ids = new Set<string>();
  for (const [ruta, ops] of Object.entries(d.paths)) {
    for (const [metodo, op] of Object.entries(ops) as [
      string,
      { operationId: string; responses: object; tags: string[]; parameters?: { name: string; in: string }[] },
    ][]) {
      assert.ok(!ids.has(op.operationId), `operationId repetido: ${op.operationId}`);
      ids.add(op.operationId);
      assert.ok(Object.keys(op.responses).length > 0, `${metodo} ${ruta} sin respuestas`);
      assert.ok(
        d.tags.some((t) => t.name === op.tags[0]),
        `${metodo} ${ruta} con etiqueta desconocida`,
      );
      for (const p of ruta.match(/\{(\w+)\}/g) ?? []) {
        assert.ok(
          op.parameters?.some((x) => x.in === "path" && `{${x.name}}` === p),
          `${metodo} ${ruta} sin el parámetro ${p}`,
        );
      }
    }
  }
  // Las referencias internas apuntan a componentes existentes
  const texto = JSON.stringify(d);
  for (const [, tipo, nombre] of texto.matchAll(/"#\/components\/(schemas|responses)\/(\w+)"/g)) {
    assert.ok((d.components as Record<string, Record<string, unknown>>)[tipo][nombre], `referencia rota: ${tipo}/${nombre}`);
  }
});
