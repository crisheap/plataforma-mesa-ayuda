import type { Request } from "express";
import type { Db } from "../config/prisma";
import { prisma } from "../config/prisma";

export interface EventoAuditoria {
  accion: string;
  entidad: string;
  entidadId?: number | null;
  descripcion?: string;
  datos?: Record<string, unknown>;
  usuarioId?: number | null;
}

/** Registra en la bitácora inmutable (RF-ADM-04). Nunca interrumpe la operación principal. */
export async function auditar(req: Request | { ip?: string } | null, ev: EventoAuditoria, db: Db = prisma) {
  try {
    const user = req && "user" in req ? (req as Request).user : undefined;
    await db.auditoria.create({
      data: {
        accion: ev.accion,
        entidad: ev.entidad,
        entidadId: ev.entidadId ?? null,
        descripcion: ev.descripcion,
        datos: ev.datos as object | undefined,
        ip: req?.ip ?? null,
        usuarioId: ev.usuarioId ?? user?.userId ?? null,
      },
    });
  } catch (e) {
    console.error("[auditoria] no se pudo registrar:", (e as Error).message);
  }
}
