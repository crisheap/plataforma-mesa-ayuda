import { prisma } from "../config/prisma";
import { enviarCorreo } from "../core/mailer";
import { idsSupervisores, notificar } from "../core/notificar";

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
      await enviarCorreo(n.usuario.correo, `[Mesa de Ayuda] ${n.titulo}`, `Hola ${n.usuario.nombre},\n\n${n.mensaje}\n\nMesa de Ayuda SENA`);
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

/** Inicia las tareas periódicas. Devuelve una función para detenerlas. */
export function iniciarWorker(): () => void {
  const correos = setInterval(() => procesarCorreosPendientes().catch((e) => console.error("[worker]", e)), 30_000);
  const sla = setInterval(() => procesarAlertasSla().catch((e) => console.error("[worker]", e)), 60_000);
  correos.unref();
  sla.unref();
  console.log("✓ Worker de notificaciones y alertas SLA iniciado");
  return () => { clearInterval(correos); clearInterval(sla); };
}
