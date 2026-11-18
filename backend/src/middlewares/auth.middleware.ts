import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors";
import { verificarAccessToken } from "../utils/jwt";
import { prisma } from "../config/prisma";
import { estadoSeguridad, registrarEvento, sesionCerrada } from "../core/seguridad";

/** Un token con firma inválida o mal formado (no uno simplemente vencido) es un intento de falsificación. */
function tokenFalso(req: Request, e: unknown) {
  const nombre = (e as Error)?.name;
  if (nombre === "TokenExpiredError") return;
  registrarEvento({
    tipo: "TOKEN_INVALIDO",
    severidad: "ADVERTENCIA",
    descripcion: `Token de sesión alterado o falso en ${req.method} ${req.path}`,
    ip: req.ip,
    datos: { motivo: (e as Error)?.message?.slice(0, 120) },
  });
}

/**
 * Rutas que una cuenta con contraseña temporal puede usar: perfil, cambio de contraseña, tema y cierre de sesión.
 * Todo lo demás exige cambiar primero la contraseña (el bloqueo no depende solo del frontend).
 */
const RUTAS_CON_PASSWORD_TEMPORAL = /^\/api\/auth\/(me|password|tema|logout|autorizacion-datos)(\/|\?|$)/;

/** Valida el JWT y confirma que la cuenta siga ACTIVA (un bloqueo surte efecto de inmediato). */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const cab = req.headers.authorization;
  if (!cab?.startsWith("Bearer ")) throw AppError.unauthorized("Token no proporcionado");
  let payload: ReturnType<typeof verificarAccessToken>;
  try {
    payload = verificarAccessToken(cab.slice(7));
  } catch (e) {
    tokenFalso(req, e);
    throw AppError.unauthorized("Token inválido o expirado");
  }
  const u = await prisma.usuario.findUnique({
    where: { id: payload.userId },
    select: { estado: true, debeCambiarPassword: true, centroId: true, rol: { select: { nombre: true } } },
  });
  if (!u || u.estado !== "ACTIVO") throw AppError.unauthorized("La cuenta no está activa");
  // Cierre de sesiones y bloqueo de emergencia (RF-SEG-05).
  const estado = await estadoSeguridad();
  if (sesionCerrada(estado, payload.iat, u.centroId)) throw AppError.unauthorized("Tu sesión se cerró por seguridad. Vuelve a ingresar");
  if (estado.emergencia && !(u.rol.nombre === "ADMINISTRADOR" && u.centroId === null))
    throw new AppError(503, `La plataforma está en mantenimiento por seguridad: ${estado.emergencia.motivo}`);
  if (u.debeCambiarPassword && !RUTAS_CON_PASSWORD_TEMPORAL.test(req.originalUrl)) {
    throw AppError.forbidden("Debes cambiar tu contraseña temporal antes de continuar");
  }
  req.user = { userId: payload.userId, correo: payload.correo, rol: u.rol.nombre, centroId: u.centroId };
  next();
}

/** Variante sin consulta a BD: solo valida el token (para servicios satélite). */
export function authenticateStateless(req: Request, _res: Response, next: NextFunction) {
  const cab = req.headers.authorization;
  if (!cab?.startsWith("Bearer ")) throw AppError.unauthorized("Token no proporcionado");
  try {
    req.user = verificarAccessToken(cab.slice(7));
  } catch (e) {
    tokenFalso(req, e);
    throw AppError.unauthorized("Token inválido o expirado");
  }
  next();
}
