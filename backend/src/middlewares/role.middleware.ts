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
