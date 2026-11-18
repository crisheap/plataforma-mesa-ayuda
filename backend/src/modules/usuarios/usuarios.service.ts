import type { Prisma, RolNombre, TipoCorreo } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/errors";
import { generarPasswordTemporal, hashPassword, validarPolitica } from "../../utils/password";
import { nombreCompleto } from "../../utils/nombre";
import { revocarSesiones } from "../auth/auth.service";
import { clasificarCorreo, dominiosEmpresariales } from "../../core/correos";
import { emitirAcceso, type ResultadoAcceso } from "../../core/acceso";
import { type Alcance, esGeneral, filtroCentro, mismoCentro, puedeGestionar, rolesGestionables } from "../../core/centros";

const publico = {
  id: true,
  nombre: true,
  apellido: true,
  correo: true,
  estado: true,
  intentosFallidos: true,
  bloqueadoHasta: true,
  ultimoAcceso: true,
  createdAt: true,
  debeCambiarPassword: true,
  tipoCorreo: true,
  correoPersonal: true,
  rol: { select: { id: true, nombre: true } },
  centroId: true,
  centro: { select: { id: true, codigo: true, nombre: true } },
} satisfies Prisma.UsuarioSelect;

type Fila = Prisma.UsuarioGetPayload<{ select: typeof publico }>;
const mapear = (u: Fila) => ({ ...u, nombreCompleto: nombreCompleto(u) });

function exigirPolitica(password: string) {
  const fallas = validarPolitica(password);
  if (fallas.length)
    throw AppError.badRequest(
      "La contraseña no cumple la política de seguridad",
      fallas.map((message) => ({ field: "password", message })),
    );
}

async function rolId(nombre: RolNombre): Promise<number> {
  const r = await prisma.rol.findUnique({ where: { nombre } });
  if (!r) throw AppError.badRequest(`El rol ${nombre} no existe. Ejecuta el seed`);
  return r.id;
}

/**
 * Tipo de correo y correo personal coherentes (RF-USU-09): si el correo de acceso es personal,
 * no hace falta otro; el personal no puede repetir el de acceso.
 */
function correoPersonalValido(correo: string, tipo: TipoCorreo, personal: string | null | undefined): string | null {
  if (tipo === "PERSONAL" || !personal) return null;
  if (personal === correo)
    throw AppError.badRequest("El correo personal debe ser distinto del correo de acceso", [
      { field: "correoPersonal", message: "Debe ser distinto del correo de acceso" },
    ]);
  return personal;
}

/**
 * Un correo identifica a una sola persona en todo el sistema (RF-USU-11): no puede ser el correo de
 * acceso ni el correo personal de otra cuenta, en ningún centro.
 */
async function exigirCorreoLibre(correo: string, campo: "correo" | "correoPersonal", excluirId?: number) {
  const otro = await prisma.usuario.findFirst({
    where: { OR: [{ correo }, { correoPersonal: correo }], ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { id: true },
  });
  if (otro)
    throw AppError.conflict(
      campo === "correo" ? "Ya existe un usuario con ese correo" : "Ese correo personal ya está registrado en otra cuenta",
      [{ field: campo, message: "Este correo ya lo usa otra persona en la plataforma" }],
    );
}

/** Centro donde quedará la cuenta: el general elige; el administrador de centro solo crea en el suyo (RF-CEN-03). */
async function centroDestino(actor: Alcance, pedido?: number): Promise<number> {
  const id = esGeneral(actor) ? pedido : actor.centroId;
  if (!id) throw AppError.badRequest("Elige el centro al que pertenece la cuenta", [{ field: "centroId", message: "Elige un centro" }]);
  const c = await prisma.centro.findUnique({ where: { id } });
  if (!c) throw AppError.badRequest("El centro no existe", [{ field: "centroId", message: "Centro no válido" }]);
  if (!c.activo) throw AppError.badRequest("El centro está inactivo", [{ field: "centroId", message: "Centro inactivo" }]);
  return id;
}

function exigirRol(actor: Alcance, rol: RolNombre) {
  if (!rolesGestionables(actor).includes(rol))
    throw AppError.forbidden("Solo el administrador general puede crear o asignar el rol de administrador");
}

/** Carga la cuenta si el actor la puede ver (404 si es de otro centro) y exige que la pueda modificar. */
async function exigirGestion(actor: Alcance, id: number) {
  const u = await prisma.usuario.findUnique({ where: { id }, select: { id: true, centroId: true, rol: { select: { nombre: true } } } });
  const objetivo = u ? { id: u.id, centroId: u.centroId, rol: u.rol.nombre } : null;
  if (!objetivo || !(mismoCentro(actor, objetivo.centroId) || objetivo.id === actor.userId))
    throw AppError.notFound("Usuario no encontrado");
  if (objetivo.id !== actor.userId && !puedeGestionar(actor, objetivo))
    throw AppError.forbidden(
      objetivo.centroId === null
        ? "La cuenta del administrador general solo la modifica su titular"
        : "Solo el administrador general puede modificar a los administradores de centro",
    );
  return objetivo;
}

export async function crear(
  actor: Alcance,
  d: {
    nombre: string;
    apellido: string;
    correo: string;
    rol: RolNombre;
    centroId?: number;
    password?: string;
    tipoCorreo?: TipoCorreo;
    correoPersonal?: string;
    enviarAcceso?: boolean;
  },
): Promise<{ usuario: ReturnType<typeof mapear>; passwordTemporal?: string; acceso?: ResultadoAcceso }> {
  exigirRol(actor, d.rol);
  const centroId = await centroDestino(actor, d.centroId);
  await exigirCorreoLibre(d.correo, "correo");
  const tipoCorreo = d.tipoCorreo ?? clasificarCorreo(d.correo, await dominiosEmpresariales());
  const correoPersonal = correoPersonalValido(d.correo, tipoCorreo, d.correoPersonal);
  if (correoPersonal) await exigirCorreoLibre(correoPersonal, "correoPersonal");
  let temporal: string | undefined;
  let password = d.password;
  if (d.enviarAcceso)
    password = generarPasswordTemporal(); // nadie la conoce: la persona crea la suya con el enlace
  else if (password) exigirPolitica(password);
  else password = temporal = generarPasswordTemporal();
  const u = await prisma.usuario.create({
    data: {
      nombre: d.nombre,
      apellido: d.apellido,
      correo: d.correo,
      tipoCorreo,
      correoPersonal,
      password: await hashPassword(password),
      rolId: await rolId(d.rol),
      centroId,
      debeCambiarPassword: true, // toda cuenta nueva debe cambiar la contraseña inicial
    },
    select: publico,
  });
  if (d.enviarAcceso) return { usuario: mapear(u), acceso: await emitirAcceso(u.id, "BIENVENIDA") };
  return { usuario: mapear(u), passwordTemporal: temporal };
}

/** Envía (o reenvía) el enlace de acceso: bienvenida si nunca ha ingresado; si no, restablecimiento. */
export async function enviarAcceso(actor: Alcance, id: number) {
  await exigirGestion(actor, id);
  const u = await obtener(actor, id);
  return emitirAcceso(id, u.ultimoAcceso ? "RESTABLECER" : "BIENVENIDA");
}

export async function listar(
  actor: Alcance,
  f: {
    centroId?: number;
    q?: string;
    rol?: RolNombre;
    estado?: "ACTIVO" | "BLOQUEADO" | "INACTIVO";
    tipoCorreo?: TipoCorreo;
    page: number;
    pageSize: number;
  },
) {
  const where: Prisma.UsuarioWhereInput = {
    ...filtroCentro(actor, f.centroId),
    ...(f.rol ? { rol: { nombre: f.rol } } : {}),
    ...(f.estado ? { estado: f.estado } : {}),
    ...(f.tipoCorreo ? { tipoCorreo: f.tipoCorreo } : {}),
    ...(f.q
      ? {
          OR: [
            { nombre: { contains: f.q, mode: "insensitive" } },
            { apellido: { contains: f.q, mode: "insensitive" } },
            { correo: { contains: f.q, mode: "insensitive" } },
            { correoPersonal: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.usuario.count({ where }),
    prisma.usuario.findMany({ where, select: publico, orderBy: { id: "asc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
  ]);
  return { items: items.map(mapear), total, page: f.page, pageSize: f.pageSize };
}

export async function obtener(actor: Alcance, id: number) {
  const u = await prisma.usuario.findUnique({ where: { id }, select: publico });
  if (!u || !(mismoCentro(actor, u.centroId) || u.id === actor.userId)) throw AppError.notFound("Usuario no encontrado");
  return mapear(u);
}

/** Técnicos activos del centro con su carga de trabajo, para asignar casos (RF-CAS-08, RF-CEN-02). */
export async function tecnicosDisponibles(actor: Alcance, centroId?: number) {
  const tecnicos = await prisma.usuario.findMany({
    where: { estado: "ACTIVO", rol: { nombre: "TECNICO" }, ...filtroCentro(actor, centroId) },
    select: { id: true, nombre: true, apellido: true, correo: true, centroId: true },
    orderBy: [{ nombre: "asc" }, { apellido: "asc" }],
  });
  const cargas = await prisma.caso.groupBy({
    by: ["tecnicoId"],
    where: { tecnicoId: { in: tecnicos.map((t) => t.id) }, estado: { in: ["ASIGNADO", "EN_PROCESO"] } },
    _count: { _all: true },
  });
  const mapaCarga = new Map(cargas.map((c) => [c.tecnicoId, c._count._all]));
  return tecnicos.map((t) => ({ ...t, nombreCompleto: nombreCompleto(t), casosActivos: mapaCarga.get(t.id) ?? 0 }));
}

export async function actualizar(
  actor: Alcance,
  id: number,
  d: {
    nombre?: string;
    apellido?: string;
    correo?: string;
    rol?: RolNombre;
    centroId?: number;
    tipoCorreo?: TipoCorreo;
    correoPersonal?: string | null;
  },
) {
  const objetivo = await exigirGestion(actor, id);
  const previo = await obtener(actor, id);
  // Corrección del correo de acceso (RF-USU-12): único en todo el sistema; si no se indica el tipo, se deduce del dominio.
  const cambiaCorreo = d.correo !== undefined && d.correo !== previo.correo;
  const correo = cambiaCorreo ? (d.correo as string) : previo.correo;
  if (cambiaCorreo) await exigirCorreoLibre(correo, "correo", id);
  const tipoNuevo = d.tipoCorreo ?? (cambiaCorreo ? clasificarCorreo(correo, await dominiosEmpresariales()) : undefined);
  if (d.rol && d.rol !== objetivo.rol) {
    if (id === actor.userId) throw AppError.badRequest("No puedes cambiar tu propio rol");
    exigirRol(actor, d.rol);
  }
  let centroId: number | undefined;
  if (d.centroId !== undefined && d.centroId !== objetivo.centroId) {
    if (!esGeneral(actor)) throw AppError.forbidden("Solo el administrador general puede cambiar a una persona de centro");
    if (objetivo.centroId === null) throw AppError.badRequest("El administrador general no pertenece a ningún centro");
    centroId = await centroDestino(actor, d.centroId);
    const pendientes = await prisma.caso.count({ where: { tecnicoId: id, estado: { in: ["ASIGNADO", "EN_PROCESO"] } } });
    if (pendientes)
      throw AppError.conflict(`La persona tiene ${pendientes} caso(s) asignado(s) sin terminar; reasígnalos antes de cambiarla de centro`);
  }
  const u = await prisma.usuario.update({
    where: { id },
    data: {
      nombre: d.nombre,
      apellido: d.apellido,
      ...(d.rol ? { rolId: await rolId(d.rol) } : {}),
      ...(centroId ? { centroId } : {}),
      ...(cambiaCorreo ? { correo } : {}),
      ...(await correosNuevos(id, correo, previo, tipoNuevo, d.correoPersonal)),
    },
    select: publico,
  });
  if (cambiaCorreo)
    // Los enlaces de acceso enviados al correo anterior dejan de servir (podía estar mal escrito y ser de otra persona).
    await prisma.tokenAcceso.updateMany({ where: { usuarioId: id, usadoEn: null }, data: { usadoEn: new Date() } });
  return { ...mapear(u), correoAnterior: cambiaCorreo ? previo.correo : undefined };
}

/** Tipo de correo y correo personal resultantes de una edición, validados (RF-USU-09, RF-USU-11). */
async function correosNuevos(
  id: number,
  correo: string,
  previo: { correo: string; tipoCorreo: TipoCorreo; correoPersonal: string | null },
  tipoNuevo: TipoCorreo | undefined,
  personalNuevo: string | null | undefined,
) {
  if (tipoNuevo === undefined && personalNuevo === undefined && correo === previo.correo) return {};
  const tipo = tipoNuevo ?? previo.tipoCorreo;
  const personal = correoPersonalValido(correo, tipo, personalNuevo !== undefined ? personalNuevo : previo.correoPersonal);
  if (personal && personal !== previo.correoPersonal) await exigirCorreoLibre(personal, "correoPersonal", id);
  return { tipoCorreo: tipo, correoPersonal: personal };
}

/**
 * Corrección de datos básicos por el supervisor (RF-USU-13), como respaldo del administrador:
 * solo nombre, apellido y correo personal de los usuarios y técnicos de su centro.
 */
export async function corregirDatos(actor: Alcance, id: number, d: { nombre?: string; apellido?: string; correoPersonal?: string | null }) {
  if (actor.rol === "ADMINISTRADOR") return actualizar(actor, id, d);
  const u = await prisma.usuario.findUnique({ where: { id }, select: { centroId: true, rol: { select: { nombre: true } } } });
  if (!u || u.centroId === null || u.centroId !== actor.centroId) throw AppError.notFound("Usuario no encontrado");
  if (!["USUARIO", "TECNICO"].includes(u.rol.nombre))
    throw AppError.forbidden("El supervisor solo corrige los datos de usuarios y técnicos; los demás los gestiona el administrador");
  const previo = await obtener(actor, id);
  const upd = await prisma.usuario.update({
    where: { id },
    data: {
      nombre: d.nombre,
      apellido: d.apellido,
      ...(await correosNuevos(id, previo.correo, previo, undefined, d.correoPersonal)),
    },
    select: publico,
  });
  return mapear(upd);
}

/** Bloquear / desbloquear / dar de baja (RF-USU-04, RF-USU-06). */
export async function cambiarEstado(actor: Alcance, id: number, estado: "ACTIVO" | "BLOQUEADO" | "INACTIVO") {
  await exigirGestion(actor, id);
  if (id === actor.userId && estado !== "ACTIVO") throw AppError.badRequest("No puedes bloquear ni inactivar tu propia cuenta");
  const u = await prisma.usuario.update({
    where: { id },
    // Al activar se reinicia el contador y se limpia el bloqueo; el bloqueo manual no lleva fecha.
    data: estado === "ACTIVO" ? { estado, intentosFallidos: 0, bloqueadoHasta: null } : { estado, bloqueadoHasta: null },
    select: publico,
  });
  if (estado !== "ACTIVO") await revocarSesiones(id);
  return mapear(u);
}

/** Restablecimiento por el administrador sin conocer la contraseña actual (RF-USU-05, corrige H-03). */
export async function restablecerPassword(actor: Alcance, id: number, passwordNueva?: string) {
  await exigirGestion(actor, id);
  let temporal: string | undefined;
  let password = passwordNueva;
  if (password) exigirPolitica(password);
  else password = temporal = generarPasswordTemporal();
  await prisma.usuario.update({
    where: { id },
    data: { password: await hashPassword(password), debeCambiarPassword: true, intentosFallidos: 0 },
  });
  await revocarSesiones(id);
  return { passwordTemporal: temporal };
}
