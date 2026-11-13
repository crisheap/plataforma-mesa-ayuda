import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/errors";
import { nombreCompleto } from "../../utils/nombre";
import { auditar } from "../../core/audit";
import { buscarArticulos, clasificarProblema, enmascarar, esConsultaEstado, extraerNumeroCaso, quiereCrearCaso } from "./conocimiento";
import { casoPorNumero, misCasos } from "./casosClient";
import { generarRespuesta } from "./proveedores";

export const SUGERENCIAS = ["No puedo iniciar sesión", "Quiero reportar una falla", "¿Cómo va mi caso?", "El internet está lento"];

async function dueño(userId: number) {
  const u = await prisma.usuario.findUnique({ where: { id: userId }, select: { nombre: true, apellido: true, correo: true } });
  if (!u) throw AppError.unauthorized("Usuario no encontrado");
  return u;
}

async function conversacionPropia(id: number, userId: number) {
  const c = await prisma.conversacionAsistente.findFirst({ where: { id, usuarioId: userId } });
  if (!c) throw AppError.notFound("Conversación no encontrada");
  return c;
}

export async function iniciar(userId: number) {
  const u = await dueño(userId);
  const c = await prisma.conversacionAsistente.create({ data: { usuarioId: userId } });
  const saludo = `¡Hola, ${u.nombre}! 👋 Soy Botito, el asistente automatizado de la Mesa de Ayuda. Cuéntame qué problema tienes y te guío paso a paso. Si no logro resolverlo, te ayudo a crear un caso.`;
  await prisma.mensajeAsistente.create({ data: { conversacionId: c.id, rol: "ASISTENTE", contenido: saludo } });
  return { conversacion: { id: c.id }, saludo, sugerencias: SUGERENCIAS };
}

export async function enviarMensaje(conversacionId: number, userId: number, token: string, contenidoOriginal: string) {
  await conversacionPropia(conversacionId, userId);
  const u = await dueño(userId);
  const nombre = nombreCompleto(u);
  const mensaje = enmascarar(contenidoOriginal); // lo que se guarda y se envía al modelo

  const previos = await prisma.mensajeAsistente.findMany({ where: { conversacionId }, orderBy: { id: "asc" }, take: 30 });
  await prisma.mensajeAsistente.create({ data: { conversacionId, rol: "USUARIO", contenido: mensaje } });

  const consultaEstado = esConsultaEstado(mensaje);
  const numero = extraerNumeroCaso(mensaje);
  const casos = consultaEstado ? (numero ? await casoPorNumero(numero, token).then((c) => (c ? [c] : [])) : await misCasos(token)) : [];

  const articulosDb = consultaEstado ? [] : await prisma.articuloConocimiento.findMany({ where: { activo: true } });
  // Se busca con el mensaje actual y, si es corto, con el contexto reciente del usuario.
  const contexto = previos.filter((m) => m.rol === "USUARIO").slice(-2).map((m) => m.contenido).join(" ");
  const articulos = consultaEstado ? [] : buscarArticulos(articulosDb, mensaje.length < 25 ? `${contexto} ${mensaje}` : mensaje, 3);

  const { texto, proveedor } = await generarRespuesta(
    { nombre, mensaje, historial: previos, articulos, casos, consultaEstado, numeroSolicitado: numero },
    u.correo,
  );
  const guardado = await prisma.mensajeAsistente.create({ data: { conversacionId, rol: "ASISTENTE", contenido: texto } });

  // Acción sugerida: crear caso cuando no hay guía, el usuario lo pide o ya intentó varias veces.
  const mensajesUsuario = previos.filter((m) => m.rol === "USUARIO").length + 1;
  const ofrecerCaso = !consultaEstado && (quiereCrearCaso(mensaje) || articulos.length === 0 || mensajesUsuario >= 3);
  const acciones = ofrecerCaso
    ? [{ tipo: "CREAR_CASO", etiqueta: "Crear un caso con esta información", datos: { ...clasificarProblema([contexto, mensaje].join(". ").trim()), descripcion: [...previos.filter((m) => m.rol === "USUARIO").map((m) => m.contenido), mensaje].join("\n").slice(0, 3500) } }]
    : [];

  await prisma.conversacionAsistente.update({ where: { id: conversacionId }, data: { titulo: previos.length <= 1 ? mensaje.slice(0, 80) : undefined } });
  return {
    mensaje: { id: guardado.id, rol: "ASISTENTE" as const, contenido: texto },
    acciones,
    fuentes: articulos.map((a) => ({ id: a.id, titulo: a.titulo })),
    proveedor,
  };
}

export async function obtener(conversacionId: number, userId: number) {
  const c = await conversacionPropia(conversacionId, userId);
  const mensajes = await prisma.mensajeAsistente.findMany({ where: { conversacionId }, orderBy: { id: "asc" }, select: { id: true, rol: true, contenido: true, util: true, createdAt: true } });
  return { id: c.id, titulo: c.titulo, escaladaACaso: c.escaladaACaso, casoId: c.casoId, mensajes };
}

export async function calificarMensaje(conversacionId: number, mensajeId: number, userId: number, util: boolean) {
  await conversacionPropia(conversacionId, userId);
  const r = await prisma.mensajeAsistente.updateMany({ where: { id: mensajeId, conversacionId, rol: "ASISTENTE" }, data: { util } });
  if (!r.count) throw AppError.notFound("Mensaje no encontrado");
}

/** Marca la conversación como escalada a un caso real (cuando el usuario acepta «Crear caso»). */
export async function vincularCaso(conversacionId: number, userId: number, casoId: number) {
  await conversacionPropia(conversacionId, userId);
  const caso = await prisma.caso.findFirst({ where: { id: casoId, usuarioId: userId }, select: { id: true } });
  if (!caso) throw AppError.notFound("Caso no encontrado");
  await prisma.conversacionAsistente.update({ where: { id: conversacionId }, data: { escaladaACaso: true, casoId } });
  await auditar(null, { accion: "ASISTENTE_ESCALADO", entidad: "caso", entidadId: casoId, usuarioId: userId });
}
