import { type Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles, soloGeneral } from "../../middlewares/role.middleware";
import { auditar } from "../../core/audit";
import { esGeneral } from "../../core/centros";
import { estadoIntegridad } from "../../core/integridad";
import { estadoSeguridad, olvidarEstadoSeguridad, registrarEvento, TIPOS_SEGURIDAD } from "../../core/seguridad";
import { AppError } from "../../utils/errors";
import { idParam, paginacion, validar } from "../../utils/validate";
import { nuevaSesion } from "../auth/auth.service";

/**
 * Panel de Seguridad (RF-SEG-02 a RF-SEG-05): administradores de centro (su centro) y general (todo).
 * Las acciones de emergencia quedan en la auditoría y como evento de seguridad.
 */
const router = Router();
router.use(authenticate, authorizeRoles("ADMINISTRADOR"));

const alcance = (req: Request) => ({ rol: req.user!.rol, centroId: req.user!.centroId ?? null });
/** El general ve todos los eventos (o un centro); el administrador de centro, solo los de su centro. */
const filtro = (req: Request, centroId?: number): Prisma.EventoSeguridadWhereInput =>
  esGeneral(alcance(req)) ? (centroId ? { centroId } : {}) : { centroId: req.user!.centroId ?? -1 };

const SEVERIDADES = ["INFO", "ADVERTENCIA", "CRITICA"] as const;

router.get("/resumen", async (req, res) => {
  const { horas, centroId } = validar(
    z.object({ horas: z.coerce.number().int().min(1).max(720).default(24), centroId: z.coerce.number().int().positive().optional() }),
    req.query,
  );
  const desde = new Date(Date.now() - horas * 3_600_000);
  const base = filtro(req, centroId);
  const [porTipo, sinAtender, porIp, estado] = await Promise.all([
    prisma.eventoSeguridad.groupBy({ by: ["tipo"], where: { ...base, ultimoEn: { gte: desde } }, _sum: { veces: true } }),
    prisma.eventoSeguridad.groupBy({ by: ["severidad"], where: { ...base, atendido: false }, _count: { _all: true } }),
    prisma.eventoSeguridad.groupBy({
      by: ["ip"],
      where: { ...base, ultimoEn: { gte: desde }, ip: { not: null }, severidad: { not: "INFO" } },
      _sum: { veces: true },
      orderBy: { _sum: { veces: "desc" } },
      take: 5,
    }),
    estadoSeguridad(),
  ]);
  const n = (t: string) => porTipo.find((x) => x.tipo === t)?._sum.veces ?? 0;
  const general = esGeneral(alcance(req));
  res.json({
    success: true,
    data: {
      horas,
      intentosFallidos: n("LOGIN_FALLIDO"),
      cuentasBloqueadas: n("CUENTA_BLOQUEADA"),
      ataques: n("ATAQUE_FUERZA_BRUTA"),
      bloqueados: n("CAPTCHA_INVALIDO") + n("LIMITE_EXCEDIDO") + n("TOKEN_INVALIDO"),
      sospechosos: n("ENTRADA_SOSPECHOSA") + n("ARCHIVO_RECHAZADO") + n("ACCESO_DENEGADO"),
      porTipo: porTipo.map((x) => ({ tipo: x.tipo, nombre: TIPOS_SEGURIDAD[x.tipo as keyof typeof TIPOS_SEGURIDAD] ?? x.tipo, veces: x._sum.veces ?? 0 })),
      sinAtender: Object.fromEntries(SEVERIDADES.map((s) => [s, sinAtender.find((x) => x.severidad === s)?._count._all ?? 0])),
      ips: porIp.map((x) => ({ ip: x.ip, veces: x._sum.veces ?? 0 })),
      emergencia: estado.emergencia,
      integridad: general ? estadoIntegridad() : { estado: estadoIntegridad().estado, revisadoEn: estadoIntegridad().revisadoEn },
    },
  });
});

router.get("/eventos", async (req, res) => {
  const f = validar(
    paginacion.extend({
      severidad: z.enum(SEVERIDADES).optional(),
      tipo: z.string().max(40).optional(),
      atendido: z.enum(["si", "no"]).optional(),
      centroId: z.coerce.number().int().positive().optional(),
    }),
    req.query,
  );
  const where: Prisma.EventoSeguridadWhereInput = {
    ...filtro(req, f.centroId),
    ...(f.severidad ? { severidad: f.severidad } : {}),
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.atendido ? { atendido: f.atendido === "si" } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.eventoSeguridad.count({ where }),
    prisma.eventoSeguridad.findMany({ where, orderBy: { ultimoEn: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
  ]);
  res.json({
    success: true,
    data: {
      items: items.map((e) => ({ ...e, nombre: TIPOS_SEGURIDAD[e.tipo as keyof typeof TIPOS_SEGURIDAD] ?? e.tipo })),
      total,
      page: f.page,
      pageSize: f.pageSize,
    },
  });
});

router.patch("/eventos/:id/atender", async (req, res) => {
  const id = idParam(req.params.id);
  const ev = await prisma.eventoSeguridad.findFirst({ where: { id, ...filtro(req) } });
  if (!ev) throw AppError.notFound("Evento no encontrado");
  const e = await prisma.eventoSeguridad.update({
    where: { id },
    data: { atendido: true, atendidoPor: req.user!.userId, atendidoEn: new Date() },
  });
  await auditar(req, { accion: "EVENTO_SEGURIDAD_ATENDIDO", entidad: "seguridad", entidadId: id, descripcion: ev.tipo });
  res.json({ success: true, message: "Evento marcado como atendido", data: e });
});

/** Cierra todas las sesiones: del centro (administrador de centro) o de toda la plataforma o un centro (general). */
router.post("/sesiones/cerrar", async (req, res) => {
  const { centroId } = validar(z.object({ centroId: z.coerce.number().int().positive().optional() }), req.body ?? {});
  const general = esGeneral(alcance(req));
  const destino = general ? (centroId ?? null) : req.user!.centroId;
  if (!general && !destino) throw AppError.forbidden();
  if (destino && !(await prisma.centro.findUnique({ where: { id: destino } }))) throw AppError.notFound("Centro no encontrado");
  // El corte es el inicio del segundo actual: los tokens emitidos desde ahora siguen sirviendo.
  const corte = Math.floor(Date.now() / 1000) * 1000;
  const fila = await prisma.configuracionSistema.findUnique({ where: { clave: "sesionesDesde" } });
  const actual = (fila?.valor as { global?: number | null; centros?: Record<string, number> } | undefined) ?? {};
  const valor = destino
    ? { global: actual.global ?? null, centros: { ...(actual.centros ?? {}), [String(destino)]: corte } }
    : { global: corte, centros: actual.centros ?? {} };
  await prisma.configuracionSistema.upsert({ where: { clave: "sesionesDesde" }, create: { clave: "sesionesDesde", valor }, update: { valor } });
  const revocados = await prisma.refreshToken.updateMany({
    where: { revokedAt: null, ...(destino ? { usuario: { centroId: destino } } : {}) },
    data: { revokedAt: new Date() },
  });
  olvidarEstadoSeguridad();
  const alcanceTxt = destino ? `del centro ${destino}` : "de toda la plataforma";
  registrarEvento({
    tipo: "SESIONES_CERRADAS",
    severidad: "ADVERTENCIA",
    descripcion: `Se cerraron todas las sesiones ${alcanceTxt}`,
    ip: req.ip,
    usuarioId: req.user!.userId,
    centroId: destino,
  });
  await auditar(req, { accion: "SESIONES_CERRADAS", entidad: "seguridad", descripcion: `Cierre de sesiones ${alcanceTxt}`, datos: { centroId: destino } });
  // Quien ejecuta la acción recibe una sesión nueva para no expulsarse a sí mismo.
  const sesion = await nuevaSesion(req.user!.userId);
  res.json({ success: true, message: `Se cerraron las sesiones ${alcanceTxt}`, data: { sesionesRevocadas: revocados.count, sesion } });
});

/** Bloqueo de emergencia: solo el administrador general entra mientras está activo. */
router.put("/emergencia", soloGeneral, async (req, res) => {
  const d = validar(
    z.object({ activo: z.boolean(), motivo: z.string().trim().max(200).optional() }).refine((x) => !x.activo || (x.motivo?.length ?? 0) >= 5, {
      message: "Escribe el motivo (mínimo 5 caracteres); lo verán las personas al intentar entrar",
      path: ["motivo"],
    }),
    req.body,
  );
  const valor = d.activo
    ? { activo: true, motivo: d.motivo ?? "", desde: new Date().toISOString(), por: req.user!.userId }
    : { activo: false, motivo: "", desde: new Date().toISOString(), por: req.user!.userId };
  await prisma.configuracionSistema.upsert({ where: { clave: "emergencia" }, create: { clave: "emergencia", valor }, update: { valor } });
  olvidarEstadoSeguridad();
  registrarEvento({
    tipo: d.activo ? "EMERGENCIA_ACTIVADA" : "EMERGENCIA_DESACTIVADA",
    severidad: d.activo ? "CRITICA" : "INFO",
    descripcion: d.activo ? `Bloqueo de emergencia: ${d.motivo}` : "Se levantó el bloqueo de emergencia",
    ip: req.ip,
    usuarioId: req.user!.userId,
  });
  await auditar(req, {
    accion: d.activo ? "EMERGENCIA_ACTIVADA" : "EMERGENCIA_DESACTIVADA",
    entidad: "seguridad",
    descripcion: d.activo ? d.motivo : "Bloqueo levantado",
  });
  res.json({ success: true, message: d.activo ? "Bloqueo de emergencia activado" : "Bloqueo de emergencia levantado", data: valor });
});

export default router;
