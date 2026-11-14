import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../utils/errors";
import { compararPassword, hashPassword, HASH_FICTICIO, validarPolitica } from "../../utils/password";
import { firmarAccessToken, generarRefreshToken, hashToken } from "../../utils/jwt";
import { nombreCompleto } from "../../utils/nombre";
import { auditar } from "../../core/audit";
import type { RolNombre, TemaPreferido } from "../../generated/prisma/client";

export const MAX_INTENTOS = 3;
export const MINUTOS_BLOQUEO = 15;

const seleccionUsuario = {
  id: true,
  nombre: true,
  apellido: true,
  correo: true,
  estado: true,
  password: true,
  intentosFallidos: true,
  bloqueadoHasta: true,
  preferenciaTema: true,
  debeCambiarPassword: true,
  rol: { select: { nombre: true } },
} as const;

type UsuarioDb = {
  id: number;
  nombre: string;
  apellido: string;
  correo: string;
  preferenciaTema: TemaPreferido;
  debeCambiarPassword: boolean;
  rol: { nombre: RolNombre };
};

/** Usuario tal como lo ve el cliente (RF-UI-04: incluye nombre completo). */
export const usuarioPublico = (u: UsuarioDb) => ({
  id: u.id,
  nombre: u.nombre,
  apellido: u.apellido,
  nombreCompleto: nombreCompleto(u),
  correo: u.correo,
  rol: u.rol.nombre,
  preferenciaTema: u.preferenciaTema,
  debeCambiarPassword: u.debeCambiarPassword,
});

async function emitirSesion(u: UsuarioDb) {
  const token = firmarAccessToken({ userId: u.id, correo: u.correo, rol: u.rol.nombre });
  const refreshToken = generarRefreshToken();
  await prisma.refreshToken.create({
    data: {
      usuarioId: u.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.refreshDias * 86_400_000),
    },
  });
  return { token, refreshToken, expiresIn: env.accessExpiresIn, usuario: usuarioPublico(u) };
}

export async function login(correo: string, password: string, ip?: string) {
  const u = await prisma.usuario.findUnique({ where: { correo }, select: seleccionUsuario });

  if (!u) {
    await compararPassword(password, HASH_FICTICIO); // iguala tiempos de respuesta
    await prisma.intentoLogin.create({ data: { exitoso: false, ip } });
    throw AppError.unauthorized("Correo o contraseña incorrectos");
  }
  if (u.estado === "INACTIVO") throw AppError.forbidden("La cuenta está inactiva. Contacta al administrador");

  if (u.estado === "BLOQUEADO") {
    if (u.bloqueadoHasta && u.bloqueadoHasta <= new Date()) {
      // Bloqueo temporal vencido: se levanta automáticamente.
      await prisma.usuario.update({ where: { id: u.id }, data: { estado: "ACTIVO", intentosFallidos: 0, bloqueadoHasta: null } });
      u.estado = "ACTIVO";
      u.intentosFallidos = 0;
      u.bloqueadoHasta = null;
    } else {
      // Bloqueo vigente o manual (sin fecha): SIEMPRE se rechaza (corrige H-02).
      const min = u.bloqueadoHasta ? Math.max(1, Math.ceil((u.bloqueadoHasta.getTime() - Date.now()) / 60_000)) : null;
      throw AppError.forbidden(
        min
          ? `Cuenta bloqueada temporalmente. Intenta de nuevo en ${min} minuto(s)`
          : "La cuenta está bloqueada. Contacta al administrador",
      );
    }
  }

  const ok = await compararPassword(password, u.password);
  if (!ok) {
    const intentos = u.intentosFallidos + 1;
    const bloquear = intentos >= MAX_INTENTOS;
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id: u.id },
        data: {
          intentosFallidos: intentos,
          ...(bloquear ? { estado: "BLOQUEADO" as const, bloqueadoHasta: new Date(Date.now() + MINUTOS_BLOQUEO * 60_000) } : {}),
        },
      }),
      prisma.intentoLogin.create({ data: { exitoso: false, ip, usuarioId: u.id } }),
    ]);
    if (bloquear) {
      await auditar(
        { ip },
        {
          accion: "CUENTA_BLOQUEADA",
          entidad: "usuario",
          entidadId: u.id,
          usuarioId: u.id,
          descripcion: `Bloqueo automático por ${MAX_INTENTOS} intentos fallidos`,
        },
      );
      throw AppError.forbidden(`Cuenta bloqueada por ${MINUTOS_BLOQUEO} minutos tras ${MAX_INTENTOS} intentos fallidos`);
    }
    throw AppError.unauthorized(`Correo o contraseña incorrectos. Intentos restantes: ${MAX_INTENTOS - intentos}`);
  }

  // Éxito: reinicia el contador sin tocar el estado (ya es ACTIVO).
  await prisma.$transaction([
    prisma.usuario.update({ where: { id: u.id }, data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date() } }),
    prisma.intentoLogin.create({ data: { exitoso: true, ip, usuarioId: u.id } }),
  ]);
  await auditar({ ip }, { accion: "LOGIN", entidad: "usuario", entidadId: u.id, usuarioId: u.id });
  return emitirSesion(u);
}

export async function refrescar(refreshToken: string) {
  const reg = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!reg || reg.revokedAt || reg.expiresAt <= new Date()) throw AppError.unauthorized("Sesión expirada. Inicia sesión de nuevo");
  const u = await prisma.usuario.findUnique({ where: { id: reg.usuarioId }, select: seleccionUsuario });
  if (!u || u.estado !== "ACTIVO") throw AppError.unauthorized("La cuenta no está activa");
  await prisma.refreshToken.update({ where: { id: reg.id }, data: { revokedAt: new Date() } }); // rotación
  return emitirSesion(u);
}

export async function cerrarSesion(refreshToken?: string) {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
}

export const revocarSesiones = (usuarioId: number) =>
  prisma.refreshToken.updateMany({ where: { usuarioId, revokedAt: null }, data: { revokedAt: new Date() } });

export async function perfil(userId: number) {
  const u = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { ...seleccionUsuario, ultimoAcceso: true, createdAt: true },
  });
  if (!u) throw AppError.notFound("Usuario no encontrado");
  return { ...usuarioPublico(u), ultimoAcceso: u.ultimoAcceso, creadoEn: u.createdAt };
}

export async function cambiarPasswordPropia(userId: number, actual: string, nueva: string) {
  const u = await prisma.usuario.findUnique({ where: { id: userId }, select: { password: true } });
  if (!u) throw AppError.notFound("Usuario no encontrado");
  if (!(await compararPassword(actual, u.password))) throw AppError.badRequest("La contraseña actual no es correcta");
  if (actual === nueva) throw AppError.badRequest("La nueva contraseña debe ser distinta de la actual");
  const fallas = validarPolitica(nueva);
  if (fallas.length) {
    throw AppError.badRequest(
      "La contraseña no cumple la política de seguridad",
      fallas.map((message) => ({ field: "passwordNueva", message })),
    );
  }
  await prisma.usuario.update({ where: { id: userId }, data: { password: await hashPassword(nueva), debeCambiarPassword: false } });
  await revocarSesiones(userId);
}

export async function actualizarTema(userId: number, tema: TemaPreferido) {
  await prisma.usuario.update({ where: { id: userId }, data: { preferenciaTema: tema } });
  return { preferenciaTema: tema };
}
