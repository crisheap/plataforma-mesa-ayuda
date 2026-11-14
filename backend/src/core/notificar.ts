import { prisma, type Db } from "../config/prisma";
import { enviarPush } from "./push";

export interface NuevaNotificacion {
  usuarioIds: number[];
  titulo: string;
  mensaje: string;
  tipo?: string;
  casoId?: number;
  correo?: boolean;
}

/** Crea notificaciones internas, deja el correo en cola para el worker y dispara el push (RF-NOT-01/02/03). */
export async function notificar(n: NuevaNotificacion, db: Db = prisma): Promise<void> {
  const ids = [...new Set(n.usuarioIds)];
  if (!ids.length) return;
  await db.notificacion.createMany({
    data: ids.map((usuarioId) => ({
      usuarioId,
      titulo: n.titulo,
      mensaje: n.mensaje,
      tipo: n.tipo ?? "GENERAL",
      casoId: n.casoId ?? null,
      correoPendiente: n.correo ?? true,
    })),
  });
  // El push no es crítico: se dispara sin bloquear ni romper la operación.
  for (const id of ids) {
    enviarPush(id, { titulo: n.titulo, mensaje: n.mensaje, url: n.casoId ? `#/casos/${n.casoId}` : "#/notificaciones" }).catch(
      () => undefined,
    );
  }
}

export async function idsSupervisores(db: Db = prisma): Promise<number[]> {
  const s = await db.usuario.findMany({
    where: { estado: "ACTIVO", rol: { nombre: { in: ["SUPERVISOR", "ADMINISTRADOR"] } } },
    select: { id: true },
  });
  return s.map((x) => x.id);
}
