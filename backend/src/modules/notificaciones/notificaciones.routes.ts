import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { authenticate } from "../../middlewares/auth.middleware";
import { AppError } from "../../utils/errors";
import { idParam, paginacion, validar } from "../../utils/validate";
import { pushDisponible } from "../../core/push";

export const notificacionesRouter = Router();
notificacionesRouter.use(authenticate);

notificacionesRouter.get("/", async (req, res) => {
  const { page, pageSize, soloNoLeidas } = validar(
    paginacion.extend({ soloNoLeidas: z.enum(["true", "false"]).transform((v) => v === "true").optional() }), req.query);
  const where = { usuarioId: req.user!.userId, ...(soloNoLeidas ? { leida: false } : {}) };
  const [total, noLeidas, items] = await prisma.$transaction([
    prisma.notificacion.count({ where }),
    prisma.notificacion.count({ where: { usuarioId: req.user!.userId, leida: false } }),
    prisma.notificacion.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, titulo: true, mensaje: true, tipo: true, casoId: true, leida: true, createdAt: true },
    }),
  ]);
  res.json({ success: true, data: { items, total, noLeidas, page, pageSize } });
});

notificacionesRouter.patch("/leer-todas", async (req, res) => {
  const r = await prisma.notificacion.updateMany({ where: { usuarioId: req.user!.userId, leida: false }, data: { leida: true } });
  res.json({ success: true, data: { actualizadas: r.count } });
});

notificacionesRouter.patch("/:id/leida", async (req, res) => {
  const r = await prisma.notificacion.updateMany({ where: { id: idParam(req.params.id), usuarioId: req.user!.userId }, data: { leida: true } });
  if (!r.count) throw AppError.notFound("Notificación no encontrada");
  res.json({ success: true });
});

// ───────────── Push web (RF-NOT-03) ─────────────
export const pushRouter = Router();

pushRouter.get("/clave-publica", (_req, res) => {
  res.json({ success: true, data: { habilitado: pushDisponible(), clavePublica: env.vapid.publica || null } });
});

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(5).max(100) }),
});

pushRouter.post("/suscripciones", authenticate, async (req, res) => {
  const s = validar(subSchema, req.body);
  await prisma.suscripcionPush.upsert({
    where: { endpoint: s.endpoint },
    update: { usuarioId: req.user!.userId, p256dh: s.keys.p256dh, auth: s.keys.auth },
    create: { endpoint: s.endpoint, usuarioId: req.user!.userId, p256dh: s.keys.p256dh, auth: s.keys.auth },
  });
  res.status(201).json({ success: true, message: "Notificaciones push activadas" });
});

pushRouter.delete("/suscripciones", authenticate, async (req, res) => {
  const { endpoint } = validar(z.object({ endpoint: z.string().url() }), req.body);
  await prisma.suscripcionPush.deleteMany({ where: { endpoint, usuarioId: req.user!.userId } });
  res.json({ success: true, message: "Notificaciones push desactivadas" });
});
