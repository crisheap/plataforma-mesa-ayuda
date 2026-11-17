import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { authorizeRoles, soloGeneral } from "../../middlewares/role.middleware";
import { rateLimit } from "../../middlewares/rateLimit.middleware";
import { AppError } from "../../utils/errors";
import { idParam, validar } from "../../utils/validate";
import { auditar } from "../../core/audit";
import { clasificarProblema, enmascarar } from "./conocimiento";
import * as svc from "./asistente.service";

/** `auth` permite usar el mismo router embebido (consulta BD) o como servicio independiente (solo JWT). */
export function crearAsistenteRouter(auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);

  const limite = rateLimit({
    ventanaMs: 60_000,
    max: env.ia.maxMensajesPorMinuto,
    clave: (req) => `u${req.user?.userId}`,
    mensaje: "Estás escribiendo muy rápido. Espera un momento",
  });
  const token = (h?: string) => (h ?? "").replace(/^Bearer\s+/i, "");

  router.post("/conversaciones", async (req, res) => {
    res.status(201).json({ success: true, data: await svc.iniciar(req.user!.userId) });
  });

  router.get("/conversaciones/:id", async (req, res) => {
    res.json({ success: true, data: await svc.obtener(idParam(req.params.id), req.user!.userId) });
  });

  router.post("/conversaciones/:id/mensajes", limite, async (req, res) => {
    const { contenido } = validar(
      z.object({ contenido: z.string().trim().min(1, "Escribe un mensaje").max(1500, "El mensaje es muy largo") }),
      req.body,
    );
    const r = await svc.enviarMensaje(idParam(req.params.id), req.user!.userId, token(req.headers.authorization), contenido);
    res.json({ success: true, data: r });
  });

  router.patch("/conversaciones/:id/mensajes/:mid/util", async (req, res) => {
    const { util } = validar(z.object({ util: z.boolean() }), req.body);
    await svc.calificarMensaje(idParam(req.params.id), idParam(req.params.mid, "mid"), req.user!.userId, util);
    res.json({ success: true });
  });

  router.patch("/conversaciones/:id/caso", async (req, res) => {
    const { casoId } = validar(z.object({ casoId: z.number().int().positive() }), req.body);
    await svc.vincularCaso(idParam(req.params.id), req.user!.userId, casoId);
    res.json({ success: true });
  });

  router.post("/sugerencia-caso", limite, async (req, res) => {
    const { texto } = validar(z.object({ texto: z.string().trim().min(5).max(3000) }), req.body);
    res.json({ success: true, data: clasificarProblema(enmascarar(texto)) });
  });

  // ───────────── Administración de la base de conocimiento ─────────────
  const adm = [authorizeRoles("ADMINISTRADOR"), soloGeneral];
  const articuloSchema = z.object({
    titulo: z.string().trim().min(5).max(150),
    contenido: z.string().trim().min(20).max(6000),
    palabrasClave: z.array(z.string().trim().min(2).max(60)).min(1).max(20),
    categoria: z.enum(["HARDWARE", "SOFTWARE", "RED", "CORREO", "PLATAFORMAS_INSTITUCIONALES"]).nullable().optional(),
    activo: z.boolean().optional(),
  });

  router.get("/conocimiento", adm, async (_req, res) => {
    res.json({ success: true, data: await prisma.articuloConocimiento.findMany({ orderBy: { id: "asc" } }) });
  });
  router.post("/conocimiento", adm, async (req, res) => {
    const a = await prisma.articuloConocimiento.create({ data: validar(articuloSchema, req.body) });
    await auditar(req, { accion: "ARTICULO_CREADO", entidad: "articulo", entidadId: a.id });
    res.status(201).json({ success: true, data: a });
  });
  router.patch("/conocimiento/:id", adm, async (req, res) => {
    const id = idParam(req.params.id);
    const d = validar(articuloSchema.partial(), req.body);
    if (!(await prisma.articuloConocimiento.findUnique({ where: { id } }))) throw AppError.notFound("Artículo no encontrado");
    const a = await prisma.articuloConocimiento.update({ where: { id }, data: d });
    await auditar(req, { accion: "ARTICULO_EDITADO", entidad: "articulo", entidadId: id });
    res.json({ success: true, data: a });
  });

  return router;
}
