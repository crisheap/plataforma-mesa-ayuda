/**
 * Observabilidad (RNF-14): registros estructurados por petición y métricas en formato Prometheus.
 *
 * - Cada respuesta lleva la cabecera X-Request-Id para correlacionar registros.
 * - LOG_PETICIONES=json escribe una línea JSON por petición (por defecto en producción);
 *   «texto» la escribe legible y «no» la desactiva.
 * - GET /api/metrics expone contadores, latencias e indicadores del negocio. Solo responde si se
 *   define METRICS_TOKEN y la petición lo envía como «Authorization: Bearer <token>».
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";

const LIMITES_SEG = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

interface Serie { conteo: number; suma: number; cubetas: number[] }
const peticiones = new Map<string, number>(); // "metodo|ruta|estado" → total
const latencias = new Map<string, Serie>(); // "metodo|ruta" → histograma
const inicio = Date.now();

/** Ruta como plantilla (/api/casos/:id) para no crear una serie por cada id. */
export function plantillaRuta(req: Request): string {
  const ruta = req.route?.path;
  if (typeof ruta === "string") return (req.baseUrl + (ruta === "/" ? "" : ruta)) || "/";
  if (req.originalUrl.startsWith("/api/")) return "/api/(sin_ruta)";
  return "(estaticos)";
}

export function registrarPeticion(metodo: string, ruta: string, estado: number, segundos: number) {
  const clave = `${metodo}|${ruta}|${estado}`;
  peticiones.set(clave, (peticiones.get(clave) ?? 0) + 1);
  const k = `${metodo}|${ruta}`;
  const s = latencias.get(k) ?? { conteo: 0, suma: 0, cubetas: LIMITES_SEG.map(() => 0) };
  s.conteo++;
  s.suma += segundos;
  LIMITES_SEG.forEach((l, i) => { if (segundos <= l) s.cubetas[i]++; });
  latencias.set(k, s);
}

/** Middleware: identificador de petición, registro estructurado y métricas. */
export function observarPeticiones(req: Request, res: Response, next: NextFunction) {
  const id = (typeof req.headers["x-request-id"] === "string" && /^[\w-]{8,64}$/.test(req.headers["x-request-id"]))
    ? req.headers["x-request-id"] : randomUUID();
  res.setHeader("X-Request-Id", id);
  const t0 = process.hrtime.bigint();
  res.on("finish", () => {
    const seg = Number(process.hrtime.bigint() - t0) / 1e9;
    const ruta = plantillaRuta(req);
    if (ruta !== "(estaticos)" && ruta !== "/api/metrics") registrarPeticion(req.method, ruta, res.statusCode, seg);
    if (env.logPeticiones === "no") return;
    const linea = {
      nivel: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "aviso" : "info",
      ts: new Date().toISOString(), requestId: id, metodo: req.method, ruta, estado: res.statusCode,
      ms: Math.round(seg * 1000), usuarioId: req.user?.userId ?? null, ip: req.ip,
    };
    console.log(env.logPeticiones === "json" ? JSON.stringify(linea) : `${linea.ts} ${linea.metodo} ${req.originalUrl.split("?")[0]} → ${linea.estado} (${linea.ms} ms)`);
  });
  next();
}

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Texto en formato de exposición de Prometheus 0.0.4. */
export async function metricasTexto(): Promise<string> {
  const l: string[] = [];
  l.push("# HELP mesa_http_peticiones_total Peticiones HTTP atendidas por la API.", "# TYPE mesa_http_peticiones_total counter");
  for (const [k, v] of peticiones) {
    const [m, r, e] = k.split("|");
    l.push(`mesa_http_peticiones_total{metodo="${m}",ruta="${esc(r)}",estado="${e}"} ${v}`);
  }
  l.push("# HELP mesa_http_duracion_segundos Duración de las peticiones HTTP.", "# TYPE mesa_http_duracion_segundos histogram");
  for (const [k, s] of latencias) {
    const [m, r] = k.split("|");
    const et = `metodo="${m}",ruta="${esc(r)}"`;
    LIMITES_SEG.forEach((lim, i) => l.push(`mesa_http_duracion_segundos_bucket{${et},le="${lim}"} ${s.cubetas[i]}`));
    l.push(`mesa_http_duracion_segundos_bucket{${et},le="+Inf"} ${s.conteo}`, `mesa_http_duracion_segundos_sum{${et}} ${s.suma.toFixed(6)}`, `mesa_http_duracion_segundos_count{${et}} ${s.conteo}`);
  }

  // Indicadores del negocio (si la base de datos no responde, se reporta mesa_db_disponible 0).
  try {
    const [porEstado, vencidos, correos] = await Promise.all([
      prisma.caso.groupBy({ by: ["estado"], _count: { _all: true } }),
      prisma.caso.count({ where: { slaVenceEn: { lt: new Date() }, estado: { in: ["ABIERTO", "ASIGNADO", "EN_PROCESO"] } } }),
      prisma.notificacion.count({ where: { correoPendiente: true } }),
    ]);
    l.push("# HELP mesa_db_disponible 1 si la base de datos respondió.", "# TYPE mesa_db_disponible gauge", "mesa_db_disponible 1");
    l.push("# HELP mesa_casos Casos por estado.", "# TYPE mesa_casos gauge");
    for (const g of porEstado) l.push(`mesa_casos{estado="${g.estado}"} ${g._count._all}`);
    l.push("# HELP mesa_casos_sla_vencido Casos abiertos con el SLA vencido.", "# TYPE mesa_casos_sla_vencido gauge", `mesa_casos_sla_vencido ${vencidos}`);
    l.push("# HELP mesa_correos_pendientes Notificaciones con correo por enviar.", "# TYPE mesa_correos_pendientes gauge", `mesa_correos_pendientes ${correos}`);
  } catch {
    l.push("# HELP mesa_db_disponible 1 si la base de datos respondió.", "# TYPE mesa_db_disponible gauge", "mesa_db_disponible 0");
  }

  const mem = process.memoryUsage();
  l.push("# HELP mesa_proceso_memoria_bytes Memoria residente del proceso.", "# TYPE mesa_proceso_memoria_bytes gauge", `mesa_proceso_memoria_bytes ${mem.rss}`);
  l.push("# HELP mesa_proceso_activo_segundos Tiempo desde que inició el proceso.", "# TYPE mesa_proceso_activo_segundos gauge", `mesa_proceso_activo_segundos ${Math.round((Date.now() - inicio) / 1000)}`);
  return l.join("\n") + "\n";
}

/** Compara el token de métricas en tiempo constante. */
export function tokenMetricasValido(cabecera: string | undefined): boolean {
  if (!env.metricsToken || !cabecera?.startsWith("Bearer ")) return false;
  const a = Buffer.from(cabecera.slice(7));
  const b = Buffer.from(env.metricsToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
