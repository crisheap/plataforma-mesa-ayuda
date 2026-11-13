import type { Prisma, RolNombre } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/errors";
import { generarPasswordTemporal, hashPassword, validarPolitica } from "../../utils/password";
import { nombreCompleto } from "../../utils/nombre";
import { revocarSesiones } from "../auth/auth.service";

const publico = {
  id: true, nombre: true, apellido: true, correo: true, estado: true, intentosFallidos: true,
  bloqueadoHasta: true, ultimoAcceso: true, createdAt: true, debeCambiarPassword: true,
  rol: { select: { id: true, nombre: true } },
} satisfies Prisma.UsuarioSelect;

type Fila = Prisma.UsuarioGetPayload<{ select: typeof publico }>;
const mapear = (u: Fila) => ({ ...u, nombreCompleto: nombreCompleto(u) });

function exigirPolitica(password: string) {
  const fallas = validarPolitica(password);
  if (fallas.length) throw AppError.badRequest("La contraseña no cumple la política de seguridad", fallas.map((message) => ({ field: "password", message })));
}

async function rolId(nombre: RolNombre): Promise<number> {
  const r = await prisma.rol.findUnique({ where: { nombre } });
  if (!r) throw AppError.badRequest(`El rol ${nombre} no existe. Ejecuta el seed`);
  return r.id;
}

export async function crear(d: { nombre: string; apellido: string; correo: string; rol: RolNombre; password?: string }) {
  if (await prisma.usuario.findUnique({ where: { correo: d.correo } })) throw AppError.conflict("Ya existe un usuario con ese correo");
  let temporal: string | undefined;
  let password = d.password;
  if (password) exigirPolitica(password);
  else password = temporal = generarPasswordTemporal();
  const u = await prisma.usuario.create({
    data: {
      nombre: d.nombre, apellido: d.apellido, correo: d.correo,
      password: await hashPassword(password), rolId: await rolId(d.rol),
      debeCambiarPassword: true, // toda cuenta nueva debe cambiar la contraseña inicial
    },
    select: publico,
  });
  return { usuario: mapear(u), passwordTemporal: temporal };
}

export async function listar(f: { q?: string; rol?: RolNombre; estado?: "ACTIVO" | "BLOQUEADO" | "INACTIVO"; page: number; pageSize: number }) {
  const where: Prisma.UsuarioWhereInput = {
    ...(f.rol ? { rol: { nombre: f.rol } } : {}),
    ...(f.estado ? { estado: f.estado } : {}),
    ...(f.q ? { OR: [
      { nombre: { contains: f.q, mode: "insensitive" } },
      { apellido: { contains: f.q, mode: "insensitive" } },
      { correo: { contains: f.q, mode: "insensitive" } },
    ] } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.usuario.count({ where }),
    prisma.usuario.findMany({ where, select: publico, orderBy: { id: "asc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
  ]);
  return { items: items.map(mapear), total, page: f.page, pageSize: f.pageSize };
}

export async function obtener(id: number) {
  const u = await prisma.usuario.findUnique({ where: { id }, select: publico });
  if (!u) throw AppError.notFound("Usuario no encontrado");
  return mapear(u);
}

/** Técnicos activos con su carga de trabajo, para asignar casos (RF-CAS-08). */
export async function tecnicosDisponibles() {
  const tecnicos = await prisma.usuario.findMany({
    where: { estado: "ACTIVO", rol: { nombre: "TECNICO" } },
    select: { id: true, nombre: true, apellido: true, correo: true },
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

async function exigirNoUltimoAdmin(id: number) {
  const u = await prisma.usuario.findUnique({ where: { id }, select: { estado: true, rol: { select: { nombre: true } } } });
  if (u?.rol.nombre === "ADMINISTRADOR" && u.estado === "ACTIVO") {
    const otros = await prisma.usuario.count({ where: { id: { not: id }, estado: "ACTIVO", rol: { nombre: "ADMINISTRADOR" } } });
    if (otros === 0) throw AppError.conflict("No se puede dejar el sistema sin un administrador activo");
  }
}

export async function actualizar(id: number, d: { nombre?: string; apellido?: string; rol?: RolNombre }, actorId: number) {
  await obtener(id);
  if (d.rol) {
    if (id === actorId) throw AppError.badRequest("No puedes cambiar tu propio rol");
    const actual = await prisma.usuario.findUnique({ where: { id }, select: { rol: { select: { nombre: true } } } });
    if (actual?.rol.nombre === "ADMINISTRADOR" && d.rol !== "ADMINISTRADOR") await exigirNoUltimoAdmin(id);
  }
  const u = await prisma.usuario.update({
    where: { id },
    data: { nombre: d.nombre, apellido: d.apellido, ...(d.rol ? { rolId: await rolId(d.rol) } : {}) },
    select: publico,
  });
  return mapear(u);
}

/** Bloquear / desbloquear / dar de baja (RF-USU-04, RF-USU-06). */
export async function cambiarEstado(id: number, estado: "ACTIVO" | "BLOQUEADO" | "INACTIVO", actorId: number) {
  await obtener(id);
  if (id === actorId && estado !== "ACTIVO") throw AppError.badRequest("No puedes bloquear ni inactivar tu propia cuenta");
  if (estado !== "ACTIVO") await exigirNoUltimoAdmin(id);
  const u = await prisma.usuario.update({
    where: { id },
    // Al activar se reinicia el contador y se limpia el bloqueo; el bloqueo manual no lleva fecha.
    data: estado === "ACTIVO"
      ? { estado, intentosFallidos: 0, bloqueadoHasta: null }
      : { estado, bloqueadoHasta: null },
    select: publico,
  });
  if (estado !== "ACTIVO") await revocarSesiones(id);
  return mapear(u);
}

/** Restablecimiento por el administrador sin conocer la contraseña actual (RF-USU-05, corrige H-03). */
export async function restablecerPassword(id: number, passwordNueva?: string) {
  await obtener(id);
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
