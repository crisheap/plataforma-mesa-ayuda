import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/role.middleware";
import { nombreCompleto } from "../../utils/nombre";
import { paginacion, validar } from "../../utils/validate";

const router = Router();
router.use(authenticate, authorizeRoles("SUPERVISOR", "ADMINISTRADOR"));

const filtros = paginacion.extend({
  accion: z.string().trim().max(60).optional(),
  entidad: z.string().trim().max(60).optional(),
  usuarioId: z.coerce.number().int().positive().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

/** Solo lectura: la bitácora no expone operaciones de escritura ni borrado (RF-ADM-04). */
router.get("/", async (req, res) => {
  const f = validar(filtros, req.query);
  const where: Prisma.AuditoriaWhereInput = {
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
