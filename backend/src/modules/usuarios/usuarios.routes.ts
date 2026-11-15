import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/role.middleware";
import { auditar } from "../../core/audit";
import { idParam, paginacion, validar } from "../../utils/validate";
import * as svc from "./usuarios.service";

const router = Router();
router.use(authenticate);

const ROLES = ["USUARIO", "TECNICO", "SUPERVISOR", "ADMINISTRADOR"] as const;
const texto = (n: string) => z.string().trim().min(2, `${n} debe tener al menos 2 caracteres`).max(80);
const TIPOS_CORREO = ["EMPRESARIAL", "PERSONAL"] as const;
/** Correo personal opcional (RF-USU-09): "" o null lo borran. */
const correoPersonal = z
  .union([z.string().trim().toLowerCase().email("Correo personal inválido").max(150), z.literal(""), z.null()])
  .transform((v) => (v ? v : null));

const crearSchema = z.object({
  nombre: texto("El nombre"),
  apellido: texto("El apellido"),
  correo: z.string().trim().toLowerCase().email("Correo inválido"),
  rol: z.enum(ROLES),
  password: z.string().max(72).optional(),
  tipoCorreo: z.enum(TIPOS_CORREO).optional(),
  correoPersonal: correoPersonal.optional(),
  // true: envía el correo de bienvenida con el enlace para crear la contraseña (RF-USU-10).
  enviarAcceso: z.boolean().optional(),
});
const editarSchema = z
  .object({
    nombre: texto("El nombre").optional(),
    apellido: texto("El apellido").optional(),
    rol: z.enum(ROLES).optional(),
    tipoCorreo: z.enum(TIPOS_CORREO).optional(),
    correoPersonal: correoPersonal.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo");
const estadoSchema = z.object({ estado: z.enum(["ACTIVO", "BLOQUEADO", "INACTIVO"]) });
const resetSchema = z.object({ passwordNueva: z.string().max(72).optional() });
const listaSchema = paginacion.extend({
  q: z.string().trim().max(80).optional(),
  rol: z.enum(ROLES).optional(),
  estado: z.enum(["ACTIVO", "BLOQUEADO", "INACTIVO"]).optional(),
  tipoCorreo: z.enum(TIPOS_CORREO).optional(),
});

// Técnicos disponibles para asignación: Supervisor y Administrador.
router.get("/tecnicos", authorizeRoles("SUPERVISOR", "ADMINISTRADOR"), async (_req, res) => {
  res.json({ success: true, data: await svc.tecnicosDisponibles() });
});

router.use(authorizeRoles("ADMINISTRADOR"));

router.post("/", async (req, res) => {
  const d = validar(crearSchema, req.body);
  const r = await svc.crear({ ...d, correoPersonal: d.correoPersonal ?? undefined });
  await auditar(req, { accion: "USUARIO_CREADO", entidad: "usuario", entidadId: r.usuario.id, descripcion: `Rol ${r.usuario.rol.nombre}` });
  if (r.acceso)
    await auditar(req, {
      accion: "ACCESO_ENVIADO",
      entidad: "usuario",
      entidadId: r.usuario.id,
      datos: { motivo: "BIENVENIDA", enviado: r.acceso.enviado },
    });
  const message = r.acceso
    ? r.acceso.enviado
      ? `Usuario creado. Se envió el correo de bienvenida a ${r.acceso.enviadoA}`
      : "Usuario creado, pero el correo de bienvenida no se pudo enviar"
    : "Usuario creado";
  res.status(201).json({ success: true, message, data: r });
});

// Enviar o reenviar el enlace para crear o restablecer la contraseña (RF-USU-10).
router.post("/:id/enviar-acceso", async (req, res) => {
  const id = idParam(req.params.id);
  const r = await svc.enviarAcceso(id);
  await auditar(req, { accion: "ACCESO_ENVIADO", entidad: "usuario", entidadId: id, datos: { enviado: r.enviado } });
  res.json({ success: true, message: r.enviado ? `Enlace de acceso enviado a ${r.enviadoA}` : "No se pudo enviar el correo", data: r });
});

router.get("/", async (req, res) => {
  res.json({ success: true, data: await svc.listar(validar(listaSchema, req.query)) });
});

router.get("/:id", async (req, res) => {
  res.json({ success: true, data: await svc.obtener(idParam(req.params.id)) });
});

router.patch("/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const d = validar(editarSchema, req.body);
  const u = await svc.actualizar(id, d, req.user!.userId);
  await auditar(req, { accion: "USUARIO_EDITADO", entidad: "usuario", entidadId: id, datos: d });
  res.json({ success: true, message: "Usuario actualizado", data: u });
});

router.patch("/:id/estado", async (req, res) => {
  const id = idParam(req.params.id);
  const { estado } = validar(estadoSchema, req.body);
  const u = await svc.cambiarEstado(id, estado, req.user!.userId);
  await auditar(req, { accion: `USUARIO_${estado}`, entidad: "usuario", entidadId: id });
  res.json({ success: true, message: `Estado actualizado a ${estado}`, data: u });
});

router.patch("/:id/restablecer-password", async (req, res) => {
  const id = idParam(req.params.id);
  const { passwordNueva } = validar(resetSchema, req.body);
  const r = await svc.restablecerPassword(id, passwordNueva);
  await auditar(req, { accion: "PASSWORD_RESTABLECIDA", entidad: "usuario", entidadId: id });
  res.json({ success: true, message: "Contraseña restablecida. El usuario deberá cambiarla al ingresar", data: r });
});

export default router;
