import { type Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/role.middleware";
import { auditar } from "../../core/audit";
import { CODIGO_CENTRO, esGeneral } from "../../core/centros";
import { AppError } from "../../utils/errors";
import { idParam, validar } from "../../utils/validate";

/**
 * Centros de formación (RF-CEN-01). Solo el administrador general los crea y edita;
 * el personal de un centro solo ve el suyo.
 */
const router = Router();
router.use(authenticate, authorizeRoles("SUPERVISOR", "ADMINISTRADOR"));

const general = (req: Request) => {
  if (!esGeneral({ rol: req.user!.rol, centroId: req.user!.centroId ?? null }))
    throw AppError.forbidden("Solo el administrador general gestiona los centros");
};

const nombre = z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(150);
const crearSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CODIGO_CENTRO, "Usa de 2 a 10 letras o números en mayúscula, empezando por una letra (ej. CEET)"),
  nombre,
});
const editarSchema = z
  .object({ nombre: nombre.optional(), activo: z.boolean().optional() })
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo");

router.get("/", async (req, res) => {
  const where = esGeneral({ rol: req.user!.rol, centroId: req.user!.centroId ?? null }) ? {} : { id: req.user!.centroId ?? -1 };
  const centros = await prisma.centro.findMany({ where, orderBy: { codigo: "asc" } });
  const ids = centros.map((c) => c.id);
  const [usuarios, admins, casos, abiertos] = await Promise.all([
    prisma.usuario.groupBy({ by: ["centroId"], where: { centroId: { in: ids } }, _count: { _all: true } }),
    prisma.usuario.groupBy({
      by: ["centroId"],
      where: { centroId: { in: ids }, estado: "ACTIVO", rol: { nombre: "ADMINISTRADOR" } },
      _count: { _all: true },
    }),
    prisma.caso.groupBy({ by: ["centroId"], where: { centroId: { in: ids } }, _count: { _all: true } }),
    prisma.caso.groupBy({
      by: ["centroId"],
      where: { centroId: { in: ids }, estado: { in: ["ABIERTO", "ASIGNADO", "EN_PROCESO"] } },
      _count: { _all: true },
    }),
  ]);
  const n = (g: { centroId: number | null; _count: { _all: number } }[], id: number) => g.find((x) => x.centroId === id)?._count._all ?? 0;
  res.json({
    success: true,
    data: centros.map((c) => ({
      ...c,
      usuarios: n(usuarios, c.id),
      administradores: n(admins, c.id),
      casos: n(casos, c.id),
      casosSinTerminar: n(abiertos, c.id),
    })),
  });
});

router.post("/", async (req, res) => {
  general(req);
  const d = validar(crearSchema, req.body);
  if (await prisma.centro.findUnique({ where: { codigo: d.codigo } })) throw AppError.conflict(`Ya existe un centro con el código ${d.codigo}`);
  const c = await prisma.centro.create({ data: d });
  await auditar(req, { accion: "CENTRO_CREADO", entidad: "centro", entidadId: c.id, descripcion: `${c.codigo} · ${c.nombre}` });
  res.status(201).json({ success: true, message: `Centro ${c.codigo} creado`, data: c });
});

// El código no se cambia: es el prefijo de los números de caso ya emitidos.
router.patch("/:id", async (req, res) => {
  general(req);
  const id = idParam(req.params.id);
  const d = validar(editarSchema, req.body);
  if (!(await prisma.centro.findUnique({ where: { id } }))) throw AppError.notFound("Centro no encontrado");
  const c = await prisma.centro.update({ where: { id }, data: d });
  await auditar(req, { accion: "CENTRO_EDITADO", entidad: "centro", entidadId: id, datos: d });
  res.json({ success: true, message: "Centro actualizado", data: c });
});

export default router;
