import { Router, type Request } from "express";
import { z } from "zod";
import path from "node:path";
import { existsSync } from "node:fs";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/role.middleware";
import { AppError } from "../../utils/errors";
import { idParam, paginacion, validar } from "../../utils/validate";
import * as svc from "./casos.service";
import { RAIZ_UPLOADS, descartar, firmaValida, subida } from "./upload";

const router = Router();
router.use(authenticate);

const actor = (req: Request): svc.Actor => ({ userId: req.user!.userId, rol: req.user!.rol, ip: req.ip });

const TIPOS = ["INCIDENTE", "REQUERIMIENTO", "MANTENIMIENTO", "SOLICITUD_ACCESO", "OTROS"] as const;
const CATEGORIAS = ["HARDWARE", "SOFTWARE", "RED", "CORREO", "PLATAFORMAS_INSTITUCIONALES"] as const;
const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"] as const;
const ESTADOS = ["ABIERTO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO"] as const;

const crearSchema = z.object({
  titulo: z.string().trim().min(5, "El título debe tener al menos 5 caracteres").max(150),
  descripcion: z.string().trim().min(10, "La descripción debe tener al menos 10 caracteres").max(4000),
  tipo: z.enum(TIPOS),
  categoria: z.enum(CATEGORIAS),
});
const fecha = z.coerce.date().optional();
const filtrosSchema = paginacion.extend({
  estado: z.enum(ESTADOS).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  tecnicoId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  desde: fecha, hasta: fecha,
  slaVencido: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});
const asignarSchema = z.object({ tecnicoId: z.number().int().positive(), prioridad: z.enum(PRIORIDADES).optional() });
const prioridadSchema = z.object({ prioridad: z.enum(PRIORIDADES) });
const estadoSchema = z.object({ estado: z.enum(ESTADOS), solucion: z.string().trim().max(4000).optional(), motivo: z.string().trim().max(1000).optional() });
const observacionSchema = z.object({ contenido: z.string().trim().min(2, "El comentario es muy corto").max(2000), visibilidad: z.enum(["PUBLICA", "INTERNA"]).default("PUBLICA") });
const calificacionSchema = z.object({ puntuacion: z.number().int().min(1).max(5), comentario: z.string().trim().max(1000).optional() });

router.post("/", async (req, res) => {
  const caso = await svc.crear(actor(req), validar(crearSchema, req.body));
  res.status(201).json({ success: true, message: "Caso creado exitosamente", data: caso });
});

router.get("/", authorizeRoles("SUPERVISOR", "ADMINISTRADOR"), async (req, res) => {
  res.json({ success: true, data: await svc.listarTodos(validar(filtrosSchema, req.query)) });
});
router.get("/mis-casos", async (req, res) => {
  res.json({ success: true, data: await svc.listarMisCasos(req.user!.userId, validar(filtrosSchema, req.query)) });
});
router.get("/asignados", authorizeRoles("TECNICO"), async (req, res) => {
  res.json({ success: true, data: await svc.listarAsignados(req.user!.userId, validar(filtrosSchema, req.query)) });
});
router.get("/por-numero/:numero", async (req, res) => {
  const numero = String(req.params.numero);
  if (!/^CASO-\d{4}-\d{6}$/i.test(numero)) throw AppError.badRequest("Número de caso inválido");
  res.json({ success: true, data: await svc.porNumero(numero, actor(req)) });
});

router.get("/:id", async (req, res) => {
  res.json({ success: true, data: await svc.detalle(idParam(req.params.id), actor(req)) });
});
router.get("/:id/historial", async (req, res) => {
  res.json({ success: true, data: await svc.historial(idParam(req.params.id), actor(req)) });
});

router.patch("/:id/asignar", authorizeRoles("SUPERVISOR", "ADMINISTRADOR"), async (req, res) => {
  const d = validar(asignarSchema, req.body);
  res.json({ success: true, message: "Caso asignado", data: await svc.asignar(idParam(req.params.id), actor(req), d) });
});
router.patch("/:id/prioridad", authorizeRoles("SUPERVISOR", "ADMINISTRADOR"), async (req, res) => {
  const { prioridad } = validar(prioridadSchema, req.body);
  res.json({ success: true, message: "Prioridad actualizada", data: await svc.cambiarPrioridad(idParam(req.params.id), actor(req), prioridad) });
});
router.patch("/:id/estado", async (req, res) => {
  const d = validar(estadoSchema, req.body);
  res.json({ success: true, message: "Estado actualizado", data: await svc.cambiarEstado(idParam(req.params.id), actor(req), d) });
});

router.get("/:id/observaciones", async (req, res) => {
  res.json({ success: true, data: await svc.listarObservaciones(idParam(req.params.id), actor(req)) });
});
router.post("/:id/observaciones", async (req, res) => {
  const d = validar(observacionSchema, req.body);
  res.status(201).json({ success: true, message: "Observación registrada", data: await svc.agregarObservacion(idParam(req.params.id), actor(req), d) });
});

router.post("/:id/calificacion", async (req, res) => {
  const d = validar(calificacionSchema, req.body);
  res.status(201).json({ success: true, message: "Calificación registrada", data: await svc.calificar(idParam(req.params.id), actor(req), d) });
});

// ───────────── Evidencias ─────────────
router.get("/:id/evidencias", async (req, res) => {
  res.json({ success: true, data: await svc.listarEvidencias(idParam(req.params.id), actor(req)) });
});
router.post(
  "/:id/evidencias",
  async (req, _res, next) => { await svc.puedeAdjuntar(idParam(req.params.id), actor(req)); next(); }, // autoriza ANTES de recibir archivos
  subida.array("archivos", 5),
  async (req, res) => {
    const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!archivos.length) throw AppError.badRequest("Adjunta al menos un archivo en el campo «archivos»");
    const invalidos = archivos.filter((a) => !firmaValida(a.path, a.mimetype));
    if (invalidos.length) {
      descartar(archivos);
      throw AppError.badRequest(`El contenido no coincide con el tipo declarado: ${invalidos.map((a) => a.originalname).join(", ")}`);
    }
    const data = await svc.registrarEvidencias(idParam(req.params.id), actor(req), archivos);
    res.status(201).json({ success: true, message: "Evidencias adjuntadas", data });
  },
);
router.get("/:id/evidencias/:evidenciaId/descargar", async (req, res) => {
  const e = await svc.evidenciaParaDescarga(idParam(req.params.id), idParam(req.params.evidenciaId, "evidenciaId"), actor(req));
  const ruta = path.resolve(RAIZ_UPLOADS, e.rutaArchivo);
  if (!ruta.startsWith(RAIZ_UPLOADS + path.sep) || !existsSync(ruta)) throw AppError.notFound("El archivo ya no está disponible");
  res.setHeader("Content-Type", e.tipoArchivo);
  res.download(ruta, e.nombreArchivo);
});

export default router;
