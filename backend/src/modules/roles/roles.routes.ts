import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles, soloGeneral } from "../../middlewares/role.middleware";
import { AppError } from "../../utils/errors";
import { idParam } from "../../utils/validate";

/** Los roles son un catálogo fijo (enum): solo lectura (corrige H-04). */
const router = Router();
router.use(authenticate, authorizeRoles("ADMINISTRADOR"), soloGeneral);

router.get("/", async (_req, res) => {
  const roles = await prisma.rol.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { usuarios: true } } } });
  res.json({ success: true, data: roles });
});

router.get("/:id", async (req, res) => {
  const r = await prisma.rol.findUnique({ where: { id: idParam(req.params.id) }, include: { _count: { select: { usuarios: true } } } });
  if (!r) throw AppError.notFound("Rol no encontrado");
  res.json({ success: true, data: r });
});

export default router;
