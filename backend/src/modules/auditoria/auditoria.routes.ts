import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/role.middleware";
import { nombreCompleto } from "../../utils/nombre";
import { paginacion, validar } from "../../utils/validate";
import { esGeneral } from "../../core/centros";

const router = Router();
router.use(authenticate, authorizeRoles("SUPERVISOR", "ADMINISTRADOR"));

const filtros = paginacion.extend({
  accion: z.string().trim().max(60).optional(),
  entidad: z.string().trim().max(60).optional(),
  usuarioId: z.coerce.number().int().positive().optional(),
  centroId: z.coerce.number().int().positive().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

/** Solo lectura: la bitácora no expone operaciones de escritura ni borrado (RF-ADM-04). */
router.get("/", async (req, res) => {
  const f = validar(filtros, req.query);
  // Cada centro ve las acciones de su personal; el administrador general ve todo o el centro que elija (RF-CEN-02).
  const general = esGeneral({ rol: req.user!.rol, centroId: req.user!.centroId ?? null });
  const centro = general ? f.centroId : (req.user!.centroId ?? -1);
  const where: Prisma.AuditoriaWhereInput = {
    ...(centro ? { usuario: { centroId: centro } } : {}),
    ...(f.accion ? { accion: f.accion } : {}),
    ...(f.entidad ? { entidad: f.entidad } : {}),
    ...(f.usuarioId ? { usuarioId: f.usuarioId } : {}),
    ...(f.desde || f.hasta ? { createdAt: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.auditoria.count({ where }),
    prisma.auditoria.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: { usuario: { select: { id: true, nombre: true, apellido: true, correo: true } } },
    }),
  ]);
  res.json({
    success: true,
    data: {
      total,
      page: f.page,
      pageSize: f.pageSize,
      items: items.map((a) => ({ ...a, usuario: a.usuario ? { ...a.usuario, nombreCompleto: nombreCompleto(a.usuario) } : null })),
    },
  });
});

export default router;
