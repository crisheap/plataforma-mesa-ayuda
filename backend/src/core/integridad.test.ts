import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { generarManifiesto, verificarIntegridad } from "./integridad";

test("integridad: detecta archivos modificados, nuevos y eliminados (RF-SEG-04)", () => {
  const raiz = mkdtempSync(path.join(tmpdir(), "integridad-"));
  try {
    mkdirSync(path.join(raiz, "backend/dist"), { recursive: true });
    mkdirSync(path.join(raiz, "frontend/js"), { recursive: true });
    mkdirSync(path.join(raiz, "backend/dist/uploads"), { recursive: true });
    writeFileSync(path.join(raiz, "backend/dist/server.js"), "console.log('ok')");
    writeFileSync(path.join(raiz, "frontend/index.html"), "<html></html>");
    writeFileSync(path.join(raiz, "frontend/js/main.js"), "export {}");
    const manifiesto = path.join(raiz, "integridad.json");
    assert.equal(generarManifiesto(manifiesto), 3);
    assert.equal(verificarIntegridad(manifiesto, false).estado, "INTEGRO");

    // Las evidencias subidas no cuentan como código
    writeFileSync(path.join(raiz, "backend/dist/uploads/foto.png"), "x");
    assert.equal(verificarIntegridad(manifiesto, false).estado, "INTEGRO");

    writeFileSync(path.join(raiz, "frontend/index.html"), "<html><script src=//malo></script></html>");
    writeFileSync(path.join(raiz, "frontend/js/puerta.js"), "fetch('//malo')");
    unlinkSync(path.join(raiz, "frontend/js/main.js"));
    const r = verificarIntegridad(manifiesto, false);
    assert.equal(r.estado, "ALTERADO");
    assert.deepEqual(
      r.cambios.map((c) => `${c.cambio}:${c.archivo}`).sort(),
      ["ELIMINADO:frontend/js/main.js", "MODIFICADO:frontend/index.html", "NUEVO:frontend/js/puerta.js"],
    );
    assert.equal(verificarIntegridad(path.join(raiz, "no-existe.json"), false).estado, "SIN_MANIFIESTO");
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
