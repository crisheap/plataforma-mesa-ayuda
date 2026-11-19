/**
 * Enlaces de acceso de un solo uso (RF-USU-10): bienvenida a cuentas nuevas y restablecimiento.
 *
 * - El enlace lleva un token aleatorio de 256 bits; en la base de datos solo se guarda su hash.
 * - Vence en ACCESO_VIGENCIA_HORAS (48 h) y sirve una sola vez; emitir uno nuevo anula los anteriores.
 * - El correo se envía al correo personal si existe y, si no, al correo de acceso.
 * - Ninguna contraseña viaja por correo: la persona crea la suya al abrir el enlace.
 */
import { randomBytes } from "node:crypto";
import type { MotivoAcceso } from "../generated/prisma/client";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { hashToken } from "../utils/jwt";
import { hashPassword, validarPolitica } from "../utils/password";
import { nombreCompleto } from "../utils/nombre";
import { enviarCorreo } from "./mailer";
import { auditar } from "./audit";

const ROLES: Record<string, string> = {
  USUARIO: "Usuario",
  TECNICO: "Técnico",
  SUPERVISOR: "Dinamizador TICs",
  ADMINISTRADOR: "Administrador",
};
const fechaLarga = (d: Date) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" }).format(d);
const escHtml = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export interface ResultadoAcceso {
  enviadoA: string;
  enviado: boolean;
  expiraEn: Date;
  /** Solo cuando el servidor no tiene SMTP configurado (desarrollo), para poder probar el flujo. */
  enlace?: string;
  error?: string;
}

/** Contenido del correo de bienvenida o restablecimiento (texto y HTML). */
export function redactarCorreoAcceso(d: {
  nombre: string;
  correoAcceso: string;
  rol: string;
  enlace: string;
  expiraEn: Date;
  motivo: MotivoAcceso;
}) {
  const vence = fechaLarga(d.expiraEn);
  const bienvenida = d.motivo === "BIENVENIDA";
  const asunto = bienvenida
    ? "Bienvenido(a) a la Plataforma Mesa de Ayuda – SENA: crea tu contraseña"
    : "Restablece tu contraseña – Plataforma Mesa de Ayuda SENA";
  const intro = bienvenida
    ? [
        "Te damos la bienvenida a la Plataforma Mesa de Ayuda del SENA, el nuevo sistema para reportar y hacer seguimiento a tus casos de soporte técnico: equipos, programas, red, correo y plataformas institucionales.",
        "Desde la plataforma podrás registrar tus casos con evidencias, ver su estado en todo momento, recibir avisos cuando avancen, calificar la atención y conversar con Botito, el asistente que te guía paso a paso.",
      ]
    : ["El administrador de la Mesa de Ayuda generó un enlace para que restablezcas tu contraseña."];
  const consejos = [
    "Usa al menos 10 caracteres, con mayúscula, minúscula, número y símbolo.",
    "No la compartas: nadie de la mesa de ayuda te la pedirá, ni siquiera Botito.",
    "Si el enlace venció, pide al administrador que te envíe uno nuevo.",
  ];
  const texto = [
    `Hola, ${d.nombre}:`,
    "",
    ...intro.flatMap((p) => [p, ""]),
    `Tu usuario de acceso (el correo con el que inicias sesión) es: ${d.correoAcceso}`,
    `Rol asignado: ${d.rol}`,
    "",
    `${bienvenida ? "Para empezar, crea tu contraseña" : "Crea tu nueva contraseña"} en este enlace (vence el ${vence}):`,
    d.enlace,
    "",
    "Recomendaciones para tu contraseña:",
    ...consejos.map((c) => `• ${c}`),
    "",
    "Si no esperabas este correo, ignóralo: sin abrir el enlace no se activa nada.",
    "",
    "— Mesa de Ayuda SENA",
  ].join("\n");

  const verde = "#2E7D00";
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F4F7F2;font-family:Segoe UI,Arial,sans-serif;color:#1B1F23">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #DCE5D8">
<tr><td style="background:${verde};color:#FFFFFF;padding:20px 28px;font-size:20px;font-weight:700">Mesa de Ayuda SENA</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 16px;font-size:16px">Hola, <strong>${escHtml(d.nombre)}</strong>:</p>
${intro.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escHtml(p)}</p>`).join("")}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 18px;background:#F4F7F2;border-radius:8px;width:100%"><tr><td style="padding:14px 16px;line-height:1.6">
<strong>Usuario de acceso:</strong> ${escHtml(d.correoAcceso)}<br><strong>Rol:</strong> ${escHtml(d.rol)}</td></tr></table>
<p style="margin:0 0 18px;text-align:center"><a href="${escHtml(d.enlace)}" style="display:inline-block;background:${verde};color:#FFFFFF;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px">${bienvenida ? "Crear mi contraseña" : "Restablecer mi contraseña"}</a></p>
<p style="margin:0 0 18px;font-size:13px;color:#4A5A50">El enlace sirve una sola vez y vence el ${escHtml(vence)}. Si el botón no funciona, copia esta dirección en el navegador:<br><span style="word-break:break-all">${escHtml(d.enlace)}</span></p>
<p style="margin:0 0 6px;font-weight:700">Recomendaciones para tu contraseña</p>
<ul style="margin:0 0 18px;padding-left:20px;line-height:1.6">${consejos.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul>
<p style="margin:0;font-size:13px;color:#4A5A50">Si no esperabas este correo, ignóralo: sin abrir el enlace no se activa nada.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { asunto, texto, html };
}

/** Crea un enlace nuevo (anula los anteriores sin usar) y envía el correo. */
export async function emitirAcceso(usuarioId: number, motivo: MotivoAcceso): Promise<ResultadoAcceso> {
  const u = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { nombre: true, apellido: true, correo: true, correoPersonal: true, estado: true, rol: { select: { nombre: true } } },
  });
  if (!u) throw AppError.notFound("Usuario no encontrado");
  if (u.estado !== "ACTIVO") throw AppError.conflict("La cuenta no está activa: reactívala antes de enviar el acceso");

  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + env.accesoVigenciaHoras * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.tokenAcceso.deleteMany({ where: { usuarioId, usadoEn: null } }),
    prisma.tokenAcceso.create({ data: { usuarioId, tokenHash: hashToken(token), motivo, expiraEn } }),
  ]);

  // El token va en el fragmento (#), que el navegador no envía al servidor ni queda en registros.
  const enlace = `${env.appUrl}/#/activar?token=${token}`;
  const destino = u.correoPersonal ?? u.correo;
  const correo = redactarCorreoAcceso({
    nombre: u.nombre,
    correoAcceso: u.correo,
    rol: ROLES[u.rol.nombre] ?? u.rol.nombre,
    enlace,
    expiraEn,
    motivo,
  });
  const r: ResultadoAcceso = { enviadoA: destino, enviado: true, expiraEn, ...(env.smtpConfigurado ? {} : { enlace }) };
  try {
    await enviarCorreo(destino, correo.asunto, correo.texto, correo.html);
  } catch (e) {
    r.enviado = false;
    r.error = "No se pudo enviar el correo. Revisa la configuración SMTP y vuelve a enviarlo.";
    console.error("[acceso] fallo al enviar el correo:", (e as Error).message);
  }
  return r;
}

async function tokenVigente(token: string) {
  const t = await prisma.tokenAcceso.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: { select: { id: true, nombre: true, apellido: true, correo: true, estado: true } } },
  });
  if (!t || t.usadoEn || t.expiraEn < new Date())
    throw AppError.badRequest("El enlace no es válido, ya se usó o venció. Pide uno nuevo al administrador");
  if (t.usuario.estado !== "ACTIVO") throw AppError.forbidden("La cuenta no está activa. Contacta al administrador");
  return t;
}

/** Datos mínimos para mostrar la página de activación. */
export async function verificarAcceso(token: string) {
  const t = await tokenVigente(token);
  return { nombreCompleto: nombreCompleto(t.usuario), correo: t.usuario.correo, motivo: t.motivo, expiraEn: t.expiraEn };
}

/** Crea la contraseña con el enlace, lo marca como usado y cierra cualquier sesión previa. */
export async function activarAcceso(token: string, passwordNueva: string, ip?: string) {
  const t = await tokenVigente(token);
  const fallas = validarPolitica(passwordNueva);
  if (fallas.length)
    throw AppError.badRequest(
      "La contraseña no cumple la política de seguridad",
      fallas.map((message) => ({ field: "passwordNueva", message })),
    );
  const hash = await hashPassword(passwordNueva);
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: t.usuario.id },
      data: { password: hash, debeCambiarPassword: false, intentosFallidos: 0, bloqueadoHasta: null },
    }),
    prisma.tokenAcceso.update({ where: { id: t.id }, data: { usadoEn: new Date() } }),
    prisma.tokenAcceso.deleteMany({ where: { usuarioId: t.usuario.id, usadoEn: null, id: { not: t.id } } }),
    prisma.refreshToken.updateMany({ where: { usuarioId: t.usuario.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await auditar(
    { ip },
    {
      accion: t.motivo === "BIENVENIDA" ? "CUENTA_ACTIVADA" : "PASSWORD_RESTABLECIDA_ENLACE",
      entidad: "usuario",
      entidadId: t.usuario.id,
      usuarioId: t.usuario.id,
    },
  );
  return { correo: t.usuario.correo };
}
