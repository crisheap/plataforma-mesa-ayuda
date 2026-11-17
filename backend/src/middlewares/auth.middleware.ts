import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors";
import { verificarAccessToken } from "../utils/jwt";
import { prisma } from "../config/prisma";

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
  } catch {
    throw AppError.unauthorized("Token inválido o expirado");
  }
  const u = await prisma.usuario.findUnique({
    where: { id: payload.userId },
    select: { estado: true, debeCambiarPassword: true, centroId: true, rol: { select: { nombre: true } } },
  });
  if (!u || u.estado !== "ACTIVO") throw AppError.unauthorized("La cuenta no está activa");
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
  } catch {
    throw AppError.unauthorized("Token inválido o expirado");
  }
  next();
}
