import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles, soloGeneral } from "../../middlewares/role.middleware";
import { auditar } from "../../core/audit";
import { SLA_POR_DEFECTO } from "../../core/sla";
import { validar } from "../../utils/validate";

const router = Router();
router.use(authenticate);

const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"] as const;

/** Configuración vigente; si falta alguna prioridad se muestra el valor por defecto. */
export async function configuracionSla() {
  const filas = await prisma.configuracionSLA.findMany();
  return PRIORIDADES.map((p) => {
    const f = filas.find((x) => x.prioridad === p);
    return { prioridad: p, tiempoMaximo: f?.tiempoMaximo ?? SLA_POR_DEFECTO[p], activo: f?.activo ?? true, configurado: Boolean(f) };
  });
}

router.get("/", authorizeRoles("SUPERVISOR", "ADMINISTRADOR"), async (_req, res) => {
  res.json({ success: true, data: { unidad: "minutos", configuraciones: await configuracionSla() } });
});

const putSchema = z.object({
  configuraciones: z
    .array(
      z.object({
        prioridad: z.enum(PRIORIDADES),
        tiempoMaximo: z.number().int().min(5, "Mínimo 5 minutos").max(43_200, "Máximo 30 días"),
        activo: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(3),
});

router.put("/", authorizeRoles("ADMINISTRADOR"), soloGeneral, async (req, res) => {
  const { configuraciones } = validar(putSchema, req.body);
  await prisma.$transaction(async (tx) => {
    for (const c of configuraciones) {
      await tx.configuracionSLA.upsert({
        where: { prioridad: c.prioridad },
        update: { tiempoMaximo: c.tiempoMaximo, activo: c.activo },
        create: c,
      });
      // Recalcula el vencimiento de los casos aún abiertos de esa prioridad.
      if (c.activo) {
        await tx.$executeRaw`UPDATE "casos" SET "slaVenceEn" = "fechaCreacion" + make_interval(mins => ${c.tiempoMaximo}::int), "slaAlertado" = false
          WHERE "prioridad" = ${c.prioridad}::"Prioridad" AND "estado" IN ('ABIERTO','ASIGNADO','EN_PROCESO')`;
      } else {
        await tx.$executeRaw`UPDATE "casos" SET "slaVenceEn" = NULL
          WHERE "prioridad" = ${c.prioridad}::"Prioridad" AND "estado" IN ('ABIERTO','ASIGNADO','EN_PROCESO')`;
      }
    }
  });
  await auditar(req, { accion: "SLA_CONFIGURADO", entidad: "sla", datos: { configuraciones } });
  res.json({ success: true, message: "SLA actualizado", data: { unidad: "minutos", configuraciones: await configuracionSla() } });
});

export default router;
