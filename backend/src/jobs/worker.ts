import { prisma } from "../config/prisma";
import { enviarCorreo } from "../core/mailer";
import { idsSupervisores, notificar } from "../core/notificar";
import { auditar } from "../core/audit";
import { env } from "../config/env";

const MAX_INTENTOS = 5;

/** Envía los correos pendientes (RF-NOT-01). Devuelve cuántos se enviaron. */
export async function procesarCorreosPendientes(lote = 25): Promise<number> {
  const pendientes = await prisma.notificacion.findMany({
    where: { correoPendiente: true, correoIntentos: { lt: MAX_INTENTOS } },
    orderBy: { id: "asc" },
    take: lote,
    include: { usuario: { select: { correo: true, nombre: true } } },
  });
  let enviados = 0;
  for (const n of pendientes) {
    try {
      await enviarCorreo(
        n.usuario.correo,
        `[Mesa de Ayuda] ${n.titulo}`,
        `Hola ${n.usuario.nombre},\n\n${n.mensaje}\n\nMesa de Ayuda SENA`,
      );
      await prisma.notificacion.update({ where: { id: n.id }, data: { correoPendiente: false, correoEnviadoAt: new Date() } });
      enviados++;
    } catch (e) {
      console.error(`[worker] correo ${n.id} falló:`, (e as Error).message);
      await prisma.notificacion.update({
        where: { id: n.id },
        data: { correoIntentos: { increment: 1 }, correoPendiente: n.correoIntentos + 1 < MAX_INTENTOS },
      });
    }
  }
  return enviados;
}

/** Alerta a técnico y supervisores cuando un caso abierto supera su SLA (RF-ADM-01). */
export async function procesarAlertasSla(): Promise<number> {
  const vencidos = await prisma.caso.findMany({
    where: { slaVenceEn: { lte: new Date() }, slaAlertado: false, estado: { in: ["ABIERTO", "ASIGNADO", "EN_PROCESO"] } },
    select: { id: true, numeroCaso: true, tecnicoId: true, titulo: true },
    take: 100,
  });
  if (!vencidos.length) return 0;
  const supervisores = await idsSupervisores();
  for (const c of vencidos) {
    await notificar({
      usuarioIds: [...supervisores, ...(c.tecnicoId ? [c.tecnicoId] : [])],
      titulo: `SLA vencido: ${c.numeroCaso}`,
      mensaje: `El caso ${c.numeroCaso} («${c.titulo}») superó su tiempo máximo de atención.`,
      tipo: "SLA_VENCIDO",
      casoId: c.id,
    });
    await prisma.caso.update({ where: { id: c.id }, data: { slaAlertado: true } });
  }
  return vencidos.length;
}

/** Fecha antes de la cual una conversación sin actividad se considera vencida. */
export function corteRetencion(dias: number, ahora = new Date()): Date | null {
  if (!Number.isFinite(dias) || dias <= 0) return null;
  return new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
}

/**
 * Borra las conversaciones de Botito sin actividad en los últimos ASISTENTE_RETENCION_DIAS días
 * (RF-IA-07, RNF-13). Los mensajes se borran en cascada; la acción queda en la auditoría.
 */
export async function purgarConversacionesAntiguas(dias = env.asistenteRetencionDias, ahora = new Date()): Promise<number> {
  const corte = corteRetencion(dias, ahora);
  if (!corte) return 0;
  const { count } = await prisma.conversacionAsistente.deleteMany({
    where: { createdAt: { lt: corte }, mensajes: { none: { createdAt: { gte: corte } } } },
  });
  if (count > 0) {
    await auditar(null, {
      accion: "RETENCION_ASISTENTE",
      entidad: "ConversacionAsistente",
      descripcion: `Se borraron ${count} conversación(es) del asistente sin actividad desde ${corte.toISOString().slice(0, 10)}`,
      datos: { conversaciones: count, dias },
    });
  }
  return count;
}

/** Inicia las tareas periódicas. Devuelve una función para detenerlas. */
export function iniciarWorker(): () => void {
  const correos = setInterval(() => procesarCorreosPendientes().catch((e) => console.error("[worker]", e)), 30_000);
  const sla = setInterval(() => procesarAlertasSla().catch((e) => console.error("[worker]", e)), 60_000);
  const retencion = setInterval(() => purgarConversacionesAntiguas().catch((e) => console.error("[worker]", e)), 6 * 60 * 60_000);
  setTimeout(() => purgarConversacionesAntiguas().catch((e) => console.error("[worker]", e)), 60_000).unref();
  correos.unref();
  sla.unref();
  retencion.unref();
  console.log("✓ Worker de notificaciones y alertas SLA iniciado");
  return () => {
    clearInterval(correos);
    clearInterval(sla);
    clearInterval(retencion);
  };
}
