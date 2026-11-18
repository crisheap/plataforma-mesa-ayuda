import type { Request } from "express";
import { prisma } from "../config/prisma";
import type { SeveridadSeguridad } from "../generated/prisma/client";
import { notificar } from "./notificar";

/**
 * Eventos de seguridad y detección de ataques (RF-SEG-02, RF-SEG-03).
 * Las escrituras no bloquean la respuesta ni la hacen fallar: un ataque no debe tumbar el servicio.
 * Los repetidos (mismo tipo, IP y cuenta en 5 minutos) se agrupan en un solo evento con su número de veces.
 */

export const TIPOS_SEGURIDAD = {
  LOGIN_FALLIDO: "Inicio de sesión fallido",
  CUENTA_BLOQUEADA: "Cuenta bloqueada por intentos fallidos",
  ATAQUE_FUERZA_BRUTA: "Posible ataque de fuerza bruta",
  CAPTCHA_INVALIDO: "Captcha inválido o reutilizado",
  LIMITE_EXCEDIDO: "Exceso de solicitudes",
  TOKEN_INVALIDO: "Token de sesión alterado o falso",
  ACCESO_DENEGADO: "Intento de acceso sin permiso",
  ENTRADA_SOSPECHOSA: "Datos con patrones de ataque",
  ARCHIVO_RECHAZADO: "Archivo con contenido no permitido",
  INTEGRIDAD_ALTERADA: "Archivos de la aplicación modificados",
  SESIONES_CERRADAS: "Cierre de sesiones de emergencia",
  EMERGENCIA_ACTIVADA: "Bloqueo de emergencia activado",
  EMERGENCIA_DESACTIVADA: "Bloqueo de emergencia desactivado",
} as const;
export type TipoSeguridad = keyof typeof TIPOS_SEGURIDAD;

export interface NuevoEvento {
  tipo: TipoSeguridad;
  severidad: SeveridadSeguridad;
  descripcion: string;
  ip?: string | null;
  correo?: string | null;
  usuarioId?: number | null;
  centroId?: number | null;
  datos?: Record<string, unknown>;
}

const AGRUPAR_MS = 5 * 60_000;
const recientes = new Map<string, { id: number; desde: number }>();
const pendientes = new Map<string, Promise<number | null>>();

/** Guarda el evento (agrupando repeticiones) y dispara la detección. Nunca lanza. */
export function registrarEvento(e: NuevoEvento): void {
  void guardar(e)
    .then(() => detectar(e))
    .catch((err) => console.error("[seguridad]", (err as Error).message));
}

async function guardar(e: NuevoEvento): Promise<number | null> {
  const clave = `${e.tipo}|${e.ip ?? ""}|${e.usuarioId ?? e.correo ?? ""}`;
  const ahora = Date.now();
  const r = recientes.get(clave);
  if (r && ahora - r.desde < AGRUPAR_MS) {
    await prisma.eventoSeguridad.update({ where: { id: r.id }, data: { veces: { increment: 1 }, ultimoEn: new Date() } });
    return r.id;
  }
  // Varias solicitudes del mismo ataque al mismo tiempo: una crea el evento y las demás lo suman.
  const enCurso = pendientes.get(clave);
  if (enCurso) {
    const id = await enCurso;
    if (id) await prisma.eventoSeguridad.update({ where: { id }, data: { veces: { increment: 1 }, ultimoEn: new Date() } });
    return id;
  }
  const p = prisma.eventoSeguridad
    .create({
      data: {
        tipo: e.tipo,
        severidad: e.severidad,
        descripcion: e.descripcion.slice(0, 300),
        ip: e.ip?.slice(0, 64) ?? null,
        correo: e.correo?.slice(0, 150) ?? null,
        usuarioId: e.usuarioId ?? null,
        centroId: e.centroId ?? null,
        datos: (e.datos ?? undefined) as never,
      },
      select: { id: true },
    })
    .then((x) => x.id);
  pendientes.set(clave, p);
  try {
    const id = await p;
    recientes.set(clave, { id, desde: ahora });
    if (recientes.size > 5000) for (const [k, v] of recientes) if (ahora - v.desde > AGRUPAR_MS) recientes.delete(k);
    if (e.severidad === "CRITICA") await alertar(e);
    return id;
  } finally {
    pendientes.delete(clave);
  }
}

// ───── Detección de fuerza bruta (RF-SEG-03) ─────
const VENTANA_MS = 15 * 60_000;
export const UMBRAL_FUERZA_BRUTA = 10;
const fallosPorIp = new Map<string, { desde: number; n: number; correos: Set<string>; alertado: boolean }>();

/** Fallos de inicio de sesión recientes desde una IP (el captcha se endurece con ellos). */
export function fallosRecientes(ip?: string | null): number {
  const f = ip ? fallosPorIp.get(ip) : undefined;
  return f && Date.now() - f.desde < VENTANA_MS ? f.n : 0;
}

async function detectar(e: NuevoEvento) {
  if (e.tipo !== "LOGIN_FALLIDO" || !e.ip) return;
  const ahora = Date.now();
  let f = fallosPorIp.get(e.ip);
  if (!f || ahora - f.desde >= VENTANA_MS) {
    f = { desde: ahora, n: 0, correos: new Set(), alertado: false };
    fallosPorIp.set(e.ip, f);
  }
  f.n++;
  if (e.correo) f.correos.add(e.correo.toLowerCase());
  if (f.n >= UMBRAL_FUERZA_BRUTA && !f.alertado) {
    f.alertado = true;
    const varias = f.correos.size >= 3;
    await guardar({
      tipo: "ATAQUE_FUERZA_BRUTA",
      severidad: "CRITICA",
      descripcion: varias
        ? `${f.n} inicios de sesión fallidos en 15 minutos contra ${f.correos.size} cuentas distintas desde la misma IP`
        : `${f.n} inicios de sesión fallidos en 15 minutos desde la misma IP`,
      ip: e.ip,
      centroId: e.centroId ?? null,
      datos: { intentos: f.n, cuentas: [...f.correos].slice(0, 20) },
    });
  }
  if (fallosPorIp.size > 10000) for (const [k, v] of fallosPorIp) if (ahora - v.desde > VENTANA_MS) fallosPorIp.delete(k);
}

/** Avisa de un evento crítico al administrador general y a los administradores del centro afectado. */
async function alertar(e: NuevoEvento) {
  const admins = await prisma.usuario.findMany({
    where: {
      estado: "ACTIVO",
      rol: { nombre: "ADMINISTRADOR" },
      OR: [{ centroId: null }, ...(e.centroId ? [{ centroId: e.centroId }] : [])],
    },
    select: { id: true },
  });
  await notificar({
    usuarioIds: admins.map((a) => a.id),
    tipo: "SEGURIDAD",
    titulo: `Alerta de seguridad: ${TIPOS_SEGURIDAD[e.tipo]}`,
    mensaje: `${e.descripcion}${e.ip ? ` (IP ${e.ip})` : ""}. Revísalo en el menú Seguridad.`,
  });
}

// ───── Entradas con patrones de ataque (RF-SEG-02) ─────
// Solo se registran: la validación con Zod y las consultas parametrizadas ya impiden que funcionen.
const PATRONES: [RegExp, string][] = [
  [/<\s*script\b|javascript\s*:|\bon(?:error|load)\s*=/i, "XSS"],
  [/\bunion\b\s+(?:all\s+)?select\b|'\s*or\s+'?\d+'?\s*=\s*'?\d+|;\s*drop\s+table\b|\bsleep\s*\(\s*\d+\s*\)/i, "Inyección SQL"],
  [/\.\.[/\\]|%2e%2e(?:%2f|%5c)|%00/i, "Recorrido de rutas"],
  [/\$\{jndi:|\{\{\s*7\s*\*\s*7\s*\}\}/i, "Inyección de plantillas"],
];

export function patronAtaque(texto: string): string | null {
  for (const [re, nombre] of PATRONES) if (re.test(texto)) return nombre;
  return null;
}

const textoDe = (v: unknown, prof = 0): string => {
  if (prof > 4 || v === null || v === undefined) return "";
  if (typeof v === "string") return v.slice(0, 4000);
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => textoDe(x, prof + 1)).join(" ");
  if (typeof v === "object")
    return Object.entries(v as Record<string, unknown>)
      .slice(0, 50)
      .map(([k, x]) => `${k} ${textoDe(x, prof + 1)}`)
      .join(" ");
  return "";
};

/** Revisa ruta, consulta y cuerpo de una solicitud y registra si traen patrones de ataque. */
export function revisarEntrada(req: Request): void {
  let ruta = req.originalUrl;
  try {
    ruta = decodeURIComponent(req.originalUrl);
  } catch {
    /* una URL mal codificada se revisa tal cual */
  }
  const patron = patronAtaque(`${ruta} ${textoDe(req.query)} ${textoDe(req.body)}`) ?? patronAtaque(req.originalUrl);
  if (!patron) return;
  registrarEvento({
    tipo: "ENTRADA_SOSPECHOSA",
    severidad: "ADVERTENCIA",
    descripcion: `${patron} en ${req.method} ${req.path}`.slice(0, 300),
    ip: req.ip,
    usuarioId: req.user?.userId ?? null,
    centroId: req.user?.centroId ?? null,
    datos: { patron, metodo: req.method, ruta: req.path },
  });
}

// ───── Estado de emergencia y cierre de sesiones (RF-SEG-05) ─────
export interface Emergencia {
  activo: boolean;
  motivo: string;
  desde: string;
  por: number;
}
interface Estado {
  emergencia: Emergencia | null;
  sesionesDesde: { global: number | null; centros: Record<string, number> };
}
const VACIO: Estado = { emergencia: null, sesionesDesde: { global: null, centros: {} } };
let cache: { estado: Estado; en: number } | null = null;
const TTL_MS = 3000;

/** Estado leído de configuracion_sistema con una caché corta (varias réplicas se ponen al día en segundos). */
export async function estadoSeguridad(): Promise<Estado> {
  if (cache && Date.now() - cache.en < TTL_MS) return cache.estado;
  try {
    const filas = await prisma.configuracionSistema.findMany({ where: { clave: { in: ["emergencia", "sesionesDesde"] } } });
    const val = (k: string) => filas.find((f) => f.clave === k)?.valor as unknown;
    const em = val("emergencia") as Emergencia | undefined;
    const ses = (val("sesionesDesde") as Estado["sesionesDesde"] | undefined) ?? VACIO.sesionesDesde;
    const estado: Estado = { emergencia: em?.activo ? em : null, sesionesDesde: { global: ses.global ?? null, centros: ses.centros ?? {} } };
    cache = { estado, en: Date.now() };
    return estado;
  } catch {
    return cache?.estado ?? VACIO;
  }
}
export const olvidarEstadoSeguridad = () => {
  cache = null;
};

/** ¿La sesión (emitida en `iat`, segundos) fue cerrada por un cierre de emergencia global o de su centro? */
export function sesionCerrada(estado: Estado, iat: number | undefined, centroId: number | null): boolean {
  if (!iat) return false;
  const corte = Math.max(estado.sesionesDesde.global ?? 0, centroId ? (estado.sesionesDesde.centros[String(centroId)] ?? 0) : 0);
  return corte > 0 && iat * 1000 < corte;
}
