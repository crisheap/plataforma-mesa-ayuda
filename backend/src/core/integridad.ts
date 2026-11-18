import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Protección del código (RF-SEG-04): al construir la imagen se guarda la huella SHA-256 de cada archivo
 * de la aplicación (servidor compilado y frontend). Mientras corre, el servidor compara periódicamente
 * los archivos con esa huella y avisa a los administradores si alguno cambió, apareció o desapareció.
 * El manifiesto queda dentro de la imagen, de solo lectura para el proceso (usuario sin privilegios).
 */
const CARPETAS = ["backend/dist", "frontend"];
const IGNORAR = /(^|[/\\])(uploads|node_modules|\.git)([/\\]|$)/;

export const rutaManifiesto = () => path.resolve(process.env.INTEGRIDAD_MANIFIESTO ?? path.resolve(process.cwd(), "../integridad.json"));

function listar(base: string, rel: string, salida: string[]) {
  const abs = path.join(base, rel);
  if (!existsSync(abs)) return;
  for (const nombre of readdirSync(abs)) {
    const r = path.posix.join(rel.split(path.sep).join("/"), nombre);
    if (IGNORAR.test(r)) continue;
    const st = statSync(path.join(base, r));
    if (st.isDirectory()) listar(base, r, salida);
    else if (st.isFile()) salida.push(r);
  }
}

const huella = (archivo: string) => createHash("sha256").update(readFileSync(archivo)).digest("hex");

/** Calcula las huellas de la aplicación a partir de `base` (la carpeta que contiene backend/ y frontend/). */
export function calcularHuellas(base: string): Record<string, string> {
  const archivos: string[] = [];
  for (const c of CARPETAS) listar(base, c, archivos);
  return Object.fromEntries(archivos.sort().map((r) => [r, huella(path.join(base, r))]));
}

export function generarManifiesto(destino = rutaManifiesto()) {
  const base = path.dirname(destino);
  const archivos = calcularHuellas(base);
  writeFileSync(destino, JSON.stringify({ generado: new Date().toISOString(), archivos }, null, 0));
  return Object.keys(archivos).length;
}

export interface EstadoIntegridad {
  estado: "INTEGRO" | "ALTERADO" | "SIN_MANIFIESTO";
  revisadoEn: string | null;
  archivos: number;
  cambios: { archivo: string; cambio: "MODIFICADO" | "NUEVO" | "ELIMINADO" }[];
}
let ultimo: EstadoIntegridad = { estado: "SIN_MANIFIESTO", revisadoEn: null, archivos: 0, cambios: [] };
let firmaUltimoAviso = "";

export const estadoIntegridad = () => ultimo;

/** Compara los archivos con el manifiesto y registra un evento crítico si algo cambió. */
// La alerta se carga solo al necesitarla: generar el manifiesto al construir la imagen no requiere
// base de datos ni variables de entorno.
export function verificarIntegridad(manifiesto = rutaManifiesto(), avisar = true): EstadoIntegridad {
  const ahora = new Date().toISOString();
  if (!existsSync(manifiesto)) {
    ultimo = { estado: "SIN_MANIFIESTO", revisadoEn: ahora, archivos: 0, cambios: [] };
    return ultimo;
  }
  const esperado = (JSON.parse(readFileSync(manifiesto, "utf8")) as { archivos: Record<string, string> }).archivos;
  const actual = calcularHuellas(path.dirname(manifiesto));
  const cambios: EstadoIntegridad["cambios"] = [];
  for (const [r, h] of Object.entries(esperado)) {
    if (!(r in actual)) cambios.push({ archivo: r, cambio: "ELIMINADO" });
    else if (actual[r] !== h) cambios.push({ archivo: r, cambio: "MODIFICADO" });
  }
  for (const r of Object.keys(actual)) if (!(r in esperado)) cambios.push({ archivo: r, cambio: "NUEVO" });
  ultimo = { estado: cambios.length ? "ALTERADO" : "INTEGRO", revisadoEn: ahora, archivos: Object.keys(esperado).length, cambios };
  const firma = cambios.map((c) => `${c.cambio}:${c.archivo}`).join("|");
  if (cambios.length && firma !== firmaUltimoAviso) {
    firmaUltimoAviso = firma;
    if (avisar) void import("./seguridad").then(({ registrarEvento }) => registrarEvento({
      tipo: "INTEGRIDAD_ALTERADA",
      severidad: "CRITICA",
      descripcion: `${cambios.length} archivo(s) de la aplicación cambiaron desde su instalación: ${cambios
        .slice(0, 3)
        .map((c) => c.archivo)
        .join(", ")}${cambios.length > 3 ? "…" : ""}`,
      datos: { cambios: cambios.slice(0, 50) },
    }));
  }
  if (!cambios.length) firmaUltimoAviso = "";
  return ultimo;
}

/** Revisión al iniciar y cada `minutos` (por defecto 10). */
export function vigilarIntegridad(minutos = Number(process.env.INTEGRIDAD_MINUTOS) || 10) {
  const revisar = () => {
    try {
      verificarIntegridad();
    } catch (e) {
      console.error("[integridad]", (e as Error).message);
    }
  };
  revisar();
  const t = setInterval(revisar, minutos * 60_000);
  t.unref();
  return () => clearInterval(t);
}
