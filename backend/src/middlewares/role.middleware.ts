import type { NextFunction, Request, Response } from "express";
import type { RolNombre } from "../generated/prisma/client";
import { AppError } from "../utils/errors";

export const authorizeRoles =
  (...roles: RolNombre[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.rol)) throw AppError.forbidden();
    next();
  };

/**
 * Solo el administrador general (ADMINISTRADOR sin centro): centros, SLA, base de conocimiento y configuración
 * comunes a toda la entidad (RF-CEN-04). Un centro desconocido (undefined) se rechaza: falla cerrada.
 */
export const soloGeneral = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw AppError.unauthorized();
  if (req.user.rol !== "ADMINISTRADOR" || req.user.centroId !== null)
    throw AppError.forbidden("Solo el administrador general puede hacer este cambio");
  next();
};
