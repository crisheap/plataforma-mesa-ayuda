/**
 * Genera el manifiesto de integridad (RF-SEG-04). Se ejecuta al construir la imagen Docker:
 *   node dist/scripts/integridad.js            → escribe ../integridad.json
 *   node dist/scripts/integridad.js verificar  → compara y termina con código 1 si algo cambió
 */
import { generarManifiesto, rutaManifiesto, verificarIntegridad } from "../core/integridad";

if (process.argv[2] === "verificar") {
  const r = verificarIntegridad(rutaManifiesto());
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.estado === "INTEGRO" ? 0 : 1);
} else {
  const n = generarManifiesto();
  console.log(`Manifiesto de integridad: ${n} archivos en ${rutaManifiesto()}`);
}
