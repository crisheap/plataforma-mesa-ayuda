import type { RolNombre } from "../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; correo: string; rol: RolNombre; centroId?: number | null };
    }
  }
}
