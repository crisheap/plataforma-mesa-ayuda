import type { EstadoCaso, Prioridad, Prisma, TipoCaso, CategoriaCaso, VisibilidadObservacion } from "../../generated/prisma/client";
import { prisma, type Tx } from "../../config/prisma";
import { AppError } from "../../utils/errors";
import { nombreCompleto } from "../../utils/nombre";
import { auditar } from "../../core/audit";
import { idsSupervisores, notificar } from "../../core/notificar";
import { ESTADOS_ABIERTOS, esPersonalInterno, evaluarCambioEstado, formatearNumeroCaso, puedeVerCaso } from "../../core/reglas";
import { filtroCentro } from "../../core/centros";
import { calcularVencimiento, minutosRestantes, semaforoSla } from "../../core/sla";

export interface Actor {
  userId: number;
  rol: "USUARIO" | "TECNICO" | "SUPERVISOR" | "ADMINISTRADOR";
  /** Centro del actor; null solo para el administrador general (RF-CEN-02). */
  centroId: number | null;
  ip?: string;
}

const personaSel = { select: { id: true, nombre: true, apellido: true, correo: true } } as const;
const centroSel = { select: { id: true, codigo: true, nombre: true } } as const;
const listaInclude = { usuario: personaSel, tecnico: personaSel, centro: centroSel } as const;

const detalleInclude = {
  usuario: personaSel,
  tecnico: personaSel,
  centro: centroSel,
  evidencias: { orderBy: { id: "asc" } },
  historial: { orderBy: { fecha: "asc" }, include: { usuario: { select: { id: true, nombre: true, apellido: true } } } },
  calificacion: true,
} satisfies Prisma.CasoInclude;

type CasoLista = Prisma.CasoGetPayload<{ include: typeof listaInclude }>;

const conPersona = <T extends { nombre: string; apellido: string } | null>(p: T) =>
  p ? { ...p, nombreCompleto: nombreCompleto(p) } : null;

/** Agrega el indicador de SLA y los nombres completos (RF-ADM-01). */
export function presentar<T extends CasoLista>(c: T) {
  return {
    ...c,
    usuario: conPersona(c.usuario),
    tecnico: conPersona(c.tecnico),
    sla: {
      semaforo: semaforoSla(c),
      venceEn: c.slaVenceEn,
      minutosRestantes: ESTADOS_ABIERTOS.includes(c.estado) ? minutosRestantes(c.slaVenceEn) : null,
    },
  };
}

// ───────────── Número de caso (atómico; corrige H-12) — consecutivo por centro y año ─────────────
async function siguienteNumero(tx: Tx, centro: { id: number; codigo: string }, fecha = new Date()): Promise<string> {
  const anio = fecha.getFullYear();
  const r = await tx.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO "contadores_caso" ("centroId", "anio", "ultimo") VALUES (${centro.id}, ${anio}, 1)
    ON CONFLICT ("centroId", "anio") DO UPDATE SET "ultimo" = "contadores_caso"."ultimo" + 1
    RETURNING "ultimo"`;
  return formatearNumeroCaso(centro.codigo, anio, Number(r[0].ultimo));
}

async function minutosSla(prioridad: Prioridad, db: Tx | typeof prisma = prisma): Promise<number | null> {
  const c = await db.configuracionSLA.findUnique({ where: { prioridad } });
  return c?.activo ? c.tiempoMaximo : null;
}

async function cargar(id: number) {
  const c = await prisma.caso.findUnique({ where: { id }, include: listaInclude });
  if (!c) throw AppError.notFound("Caso no encontrado");
  return c;
}

/** Carga el caso y exige que el actor pueda verlo (corrige H-05). Responde 404 para no revelar su existencia. */
export async function cargarAutorizado(id: number, actor: Actor) {
  const c = await cargar(id);
  if (!puedeVerCaso(actor, c)) throw AppError.notFound("Caso no encontrado");
  return c;
}

// ───────────── Crear ─────────────
export async function crear(
  actor: Actor,
  d: { titulo: string; descripcion: string; tipo: TipoCaso; categoria: CategoriaCaso; telefonoContacto?: string },
) {
  if (actor.centroId === null)
    throw AppError.badRequest("El administrador general no pertenece a un centro y no registra casos; hazlo con una cuenta del centro");
  const centro = await prisma.centro.findUnique({ where: { id: actor.centroId } });
  if (!centro?.activo) throw AppError.badRequest("Tu centro está inactivo; comunícate con el administrador");
  const caso = await prisma.$transaction(async (tx) => {
    const prioridad: Prioridad = "MEDIA"; // la prioridad la define el Supervisor/Administrador (H-07)
    const min = await minutosSla(prioridad, tx);
    const ahora = new Date();
    const c = await tx.caso.create({
      data: {
        numeroCaso: await siguienteNumero(tx, centro, ahora),
        centroId: centro.id,
        titulo: d.titulo,
        descripcion: d.descripcion,
        tipo: d.tipo,
        categoria: d.categoria,
        telefonoContacto: d.telefonoContacto ?? null,
        prioridad,
        usuarioId: actor.userId,
        fechaCreacion: ahora,
        slaVenceEn: min ? calcularVencimiento(ahora, min) : null,
      },
      include: listaInclude,
    });
    await tx.historialCaso.create({
      data: { casoId: c.id, estadoAnterior: null, estadoNuevo: "ABIERTO", descripcion: "Caso registrado", usuarioId: actor.userId },
    });
    return c;
  });
  await notificar({
    usuarioIds: [actor.userId],
    titulo: `Caso ${caso.numeroCaso} registrado`,
    mensaje: `Recibimos tu caso «${caso.titulo}». Te avisaremos cuando sea asignado.`,
    tipo: "CASO_CREADO",
    casoId: caso.id,
  });
  await notificar({
    usuarioIds: (await idsSupervisores(centro.id)).filter((i) => i !== actor.userId),
    titulo: `Nuevo caso ${caso.numeroCaso}`,
    mensaje: `«${caso.titulo}» espera asignación.`,
    tipo: "CASO_NUEVO",
    casoId: caso.id,
  });
  await auditar(actor, {
    accion: "CASO_CREADO",
    entidad: "caso",
    entidadId: caso.id,
    usuarioId: actor.userId,
    descripcion: caso.numeroCaso,
  });
  return presentar(caso);
}

// ───────────── Consultas ─────────────
export interface FiltrosCaso {
  estado?: EstadoCaso;
  prioridad?: Prioridad;
  tecnicoId?: number;
  centroId?: number;
  q?: string;
  desde?: Date;
  hasta?: Date;
  slaVencido?: boolean;
  page: number;
  pageSize: number;
}

async function consultar(base: Prisma.CasoWhereInput, f: FiltrosCaso) {
  const where: Prisma.CasoWhereInput = {
    ...base,
    ...(f.estado ? { estado: f.estado } : {}),
    ...(f.prioridad ? { prioridad: f.prioridad } : {}),
    ...(f.tecnicoId ? { tecnicoId: f.tecnicoId } : {}),
    ...(f.desde || f.hasta ? { fechaCreacion: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
    ...(f.slaVencido ? { slaVenceEn: { lte: new Date() }, estado: { in: ESTADOS_ABIERTOS } } : {}),
    ...(f.q
      ? {
          OR: [
            { numeroCaso: { contains: f.q, mode: "insensitive" } },
            { titulo: { contains: f.q, mode: "insensitive" } },
            { descripcion: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.caso.count({ where }),
    prisma.caso.findMany({
      where,
      include: listaInclude,
      orderBy: [{ fechaCreacion: "desc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
  ]);
  return { items: items.map(presentar), total, page: f.page, pageSize: f.pageSize };
}

/** Todos los casos del centro del actor; el administrador general ve todos o el centro que elija (RF-CEN-02). */
export const listarTodos = (actor: Actor, f: FiltrosCaso) => consultar(filtroCentro(actor, f.centroId), f);
export const listarMisCasos = (userId: number, f: FiltrosCaso) => consultar({ usuarioId: userId }, f);

/** Panel del técnico: ordenado por vencimiento de SLA y prioridad (RF-CAS-10). */
export async function listarAsignados(tecnicoId: number, f: FiltrosCaso) {
  const r = await consultar({ tecnicoId }, f);
  const peso = { ALTA: 0, MEDIA: 1, BAJA: 2 } as const;
  r.items.sort((a, b) => {
    const ab = ESTADOS_ABIERTOS.includes(a.estado) ? 0 : 1,
      bb = ESTADOS_ABIERTOS.includes(b.estado) ? 0 : 1;
    if (ab !== bb) return ab - bb;
    const va = a.slaVenceEn?.getTime() ?? Infinity,
      vb = b.slaVenceEn?.getTime() ?? Infinity;
    return va - vb || peso[a.prioridad] - peso[b.prioridad];
  });
  return r;
}

export async function detalle(id: number, actor: Actor) {
  await cargarAutorizado(id, actor);
  const c = await prisma.caso.findUniqueOrThrow({ where: { id }, include: detalleInclude });
  const observaciones = await listarObservaciones(id, actor);
  return {
    ...presentar(c),
    observaciones,
    historial: c.historial.map((h) => ({ ...h, usuario: conPersona(h.usuario) })),
  };
}

export async function porNumero(numero: string, actor: Actor) {
  const c = await prisma.caso.findUnique({ where: { numeroCaso: numero.toUpperCase() }, select: { id: true } });
  if (!c) throw AppError.notFound("Caso no encontrado");
  return detalle(c.id, actor);
}

export async function historial(id: number, actor: Actor) {
  await cargarAutorizado(id, actor);
  const h = await prisma.historialCaso.findMany({
    where: { casoId: id },
    orderBy: { fecha: "asc" },
    include: { usuario: { select: { id: true, nombre: true, apellido: true } } },
  });
  return h.map((x) => ({ ...x, usuario: conPersona(x.usuario) }));
}

// ───────────── Asignación y prioridad ─────────────
export async function asignar(id: number, actor: Actor, d: { tecnicoId: number; prioridad?: Prioridad }) {
  const caso = await cargarAutorizado(id, actor);
  if (caso.estado === "RESUELTO" || caso.estado === "CERRADO") throw AppError.conflict(`No se puede asignar un caso ${caso.estado}`);
  const tec = await prisma.usuario.findUnique({ where: { id: d.tecnicoId }, include: { rol: true } });
  if (!tec || tec.rol.nombre !== "TECNICO") throw AppError.badRequest("El usuario indicado no es un técnico");
  if (tec.estado !== "ACTIVO") throw AppError.badRequest("El técnico no está activo");
  if (tec.centroId !== caso.centroId) throw AppError.badRequest("El técnico debe pertenecer al mismo centro del caso");

  const nuevaPrioridad = d.prioridad ?? caso.prioridad;
  // Al reasignar un caso EN_PROCESO se conserva el estado (corrige H-10); solo ABIERTO pasa a ASIGNADO.
  const estadoNuevo: EstadoCaso = caso.estado === "ABIERTO" ? "ASIGNADO" : caso.estado;
  const reasignado = caso.tecnicoId !== null && caso.tecnicoId !== d.tecnicoId;

  const act = await prisma.$transaction(async (tx) => {
    const min = d.prioridad && d.prioridad !== caso.prioridad ? await minutosSla(nuevaPrioridad, tx) : undefined;
    const c = await tx.caso.update({
      where: { id },
      data: {
        tecnicoId: d.tecnicoId,
        estado: estadoNuevo,
        prioridad: nuevaPrioridad,
        fechaAsignacion: caso.fechaAsignacion ?? new Date(),
        ...(min !== undefined ? { slaVenceEn: min ? calcularVencimiento(caso.fechaCreacion, min) : null, slaAlertado: false } : {}),
      },
      include: listaInclude,
    });
    await tx.historialCaso.create({
      data: {
        casoId: id,
        estadoAnterior: caso.estado,
        estadoNuevo,
        descripcion: `${reasignado ? "Reasignado" : "Asignado"} a ${nombreCompleto(tec)} · prioridad ${nuevaPrioridad}`,
        usuarioId: actor.userId,
      },
    });
    return c;
  });
  await notificar({
    usuarioIds: [d.tecnicoId],
    titulo: `Caso asignado: ${act.numeroCaso}`,
    mensaje: `Se te asignó «${act.titulo}» (prioridad ${act.prioridad}).`,
    tipo: "CASO_ASIGNADO",
    casoId: id,
  });
  await notificar({
    usuarioIds: [act.usuarioId],
    titulo: `Tu caso ${act.numeroCaso} fue asignado`,
    mensaje: `${nombreCompleto(tec)} atenderá tu caso.`,
    tipo: "CASO_ASIGNADO",
    casoId: id,
  });
  if (caso.tecnicoId && reasignado) {
    await notificar({
      usuarioIds: [caso.tecnicoId],
      titulo: `Caso reasignado: ${act.numeroCaso}`,
      mensaje: "El caso fue reasignado a otro técnico.",
      tipo: "CASO_REASIGNADO",
      casoId: id,
    });
  }
  await auditar(actor, {
    accion: reasignado ? "CASO_REASIGNADO" : "CASO_ASIGNADO",
    entidad: "caso",
    entidadId: id,
    usuarioId: actor.userId,
    datos: { tecnicoId: d.tecnicoId, prioridad: nuevaPrioridad },
  });
  return presentar(act);
}

export async function cambiarPrioridad(id: number, actor: Actor, prioridad: Prioridad) {
  const caso = await cargarAutorizado(id, actor);
  if (caso.estado === "CERRADO") throw AppError.conflict("El caso está cerrado");
  if (caso.prioridad === prioridad) return presentar(caso);
  const act = await prisma.$transaction(async (tx) => {
    const min = await minutosSla(prioridad, tx);
    const c = await tx.caso.update({
      where: { id },
      data: { prioridad, slaVenceEn: min ? calcularVencimiento(caso.fechaCreacion, min) : null, slaAlertado: false },
      include: listaInclude,
    });
    await tx.historialCaso.create({
      data: {
        casoId: id,
        estadoAnterior: caso.estado,
        estadoNuevo: caso.estado,
        descripcion: `Prioridad cambiada de ${caso.prioridad} a ${prioridad}`,
        usuarioId: actor.userId,
      },
    });
    return c;
  });
  await auditar(actor, {
    accion: "CASO_PRIORIDAD",
    entidad: "caso",
    entidadId: id,
    usuarioId: actor.userId,
    datos: { de: caso.prioridad, a: prioridad },
  });
  return presentar(act);
}

// ───────────── Cambio de estado ─────────────
export async function cambiarEstado(id: number, actor: Actor, d: { estado: EstadoCaso; solucion?: string; motivo?: string }) {
  const caso = await cargarAutorizado(id, actor);
  const r = evaluarCambioEstado({
    estadoActual: caso.estado,
    destino: d.estado,
    rol: actor.rol,
    esCreador: caso.usuarioId === actor.userId,
    esTecnicoAsignado: caso.tecnicoId === actor.userId,
  });
  if (!r.ok) throw AppError.forbidden(r.motivo);
  if (r.accion === "RESOLVER" && (d.solucion?.trim().length ?? 0) < 10)
    throw AppError.badRequest("Describe la solución aplicada (mínimo 10 caracteres)");
  if (r.accion === "RECHAZAR" && (d.motivo?.trim().length ?? 0) < 5)
    throw AppError.badRequest("Indica el motivo del rechazo (mínimo 5 caracteres)");

  const ahora = new Date();
  const act = await prisma.$transaction(async (tx) => {
    const c = await tx.caso.update({
      where: { id },
      data: {
        estado: d.estado,
        ...(r.accion === "RESOLVER" ? { fechaResolucion: ahora } : {}),
        ...(r.accion === "RECHAZAR" ? { fechaResolucion: null } : {}),
        ...(r.accion === "CERRAR" ? { fechaCierre: ahora } : {}),
      },
      include: listaInclude,
    });
    const desc = {
      INICIAR: "Atención iniciada",
      RESOLVER: `Solución: ${d.solucion?.trim()}`,
      CERRAR: "Caso cerrado",
      RECHAZAR: `Solución rechazada: ${d.motivo?.trim()}`,
    }[r.accion];
    await tx.historialCaso.create({
      data: { casoId: id, estadoAnterior: caso.estado, estadoNuevo: d.estado, descripcion: desc, usuarioId: actor.userId },
    });
    if (r.accion === "RESOLVER")
      await tx.observacion.create({
        data: { casoId: id, usuarioId: actor.userId, contenido: `Solución propuesta: ${d.solucion?.trim()}`, visibilidad: "PUBLICA" },
      });
    if (r.accion === "RECHAZAR")
      await tx.observacion.create({
        data: { casoId: id, usuarioId: actor.userId, contenido: `Rechazo de la solución: ${d.motivo?.trim()}`, visibilidad: "PUBLICA" },
      });
    return c;
  });

  const destinatarios = {
    INICIAR: { ids: [act.usuarioId], t: `Tu caso ${act.numeroCaso} está en proceso`, m: "Un técnico inició la atención." },
    RESOLVER: {
      ids: [act.usuarioId],
      t: `Solución propuesta para ${act.numeroCaso}`,
      m: "Revisa la solución y confírmala para cerrar el caso, o recházala si no resolvió tu problema.",
    },
    CERRAR: {
      ids: [act.tecnicoId, act.usuarioId].filter((x): x is number => x !== null && x !== actor.userId),
      t: `Caso ${act.numeroCaso} cerrado`,
      m: "El caso fue cerrado. ¡Gracias! Puedes calificar la atención.",
    },
    RECHAZAR: {
      ids: act.tecnicoId ? [act.tecnicoId] : [],
      t: `Solución rechazada en ${act.numeroCaso}`,
      m: `El usuario rechazó la solución: ${d.motivo?.trim()}`,
    },
  }[r.accion];
  await notificar({
    usuarioIds: destinatarios.ids,
    titulo: destinatarios.t,
    mensaje: destinatarios.m,
    tipo: `CASO_${r.accion}`,
    casoId: id,
  });
  await auditar(actor, { accion: `CASO_${r.accion}`, entidad: "caso", entidadId: id, usuarioId: actor.userId });
  return presentar(act);
}

// ───────────── Observaciones ─────────────
export async function listarObservaciones(id: number, actor: Actor) {
  await cargarAutorizado(id, actor);
  const obs = await prisma.observacion.findMany({
    where: { casoId: id, ...(esPersonalInterno(actor.rol) ? {} : { visibilidad: "PUBLICA" as const }) },
    orderBy: { createdAt: "asc" },
    include: { usuario: { select: { id: true, nombre: true, apellido: true, rol: { select: { nombre: true } } } } },
  });
  return obs.map((o) => ({ ...o, usuario: { ...conPersona(o.usuario)!, rol: o.usuario.rol.nombre } }));
}

export async function agregarObservacion(id: number, actor: Actor, d: { contenido: string; visibilidad: VisibilidadObservacion }) {
  const caso = await cargarAutorizado(id, actor);
  if (caso.estado === "CERRADO") throw AppError.conflict("El caso está cerrado y no admite observaciones");
  if (d.visibilidad === "INTERNA" && !esPersonalInterno(actor.rol))
    throw AppError.forbidden("Solo el personal de soporte puede crear notas internas");
  const o = await prisma.observacion.create({
    data: { casoId: id, usuarioId: actor.userId, contenido: d.contenido, visibilidad: d.visibilidad },
  });
  if (d.visibilidad === "PUBLICA") {
    const otros = actor.userId === caso.usuarioId ? (caso.tecnicoId ? [caso.tecnicoId] : []) : [caso.usuarioId];
    await notificar({
      usuarioIds: otros,
      titulo: `Nuevo comentario en ${caso.numeroCaso}`,
      mensaje: d.contenido.slice(0, 160),
      tipo: "CASO_OBSERVACION",
      casoId: id,
    });
  }
  await auditar(actor, {
    accion: "OBSERVACION_CREADA",
    entidad: "caso",
    entidadId: id,
    usuarioId: actor.userId,
    datos: { visibilidad: d.visibilidad },
  });
  return o;
}

// ───────────── Calificación ─────────────
export async function calificar(id: number, actor: Actor, d: { puntuacion: number; comentario?: string }) {
  const caso = await cargar(id);
  if (caso.usuarioId !== actor.userId) throw AppError.forbidden("Solo quien creó el caso puede calificarlo");
  if (caso.estado !== "RESUELTO" && caso.estado !== "CERRADO")
    throw AppError.conflict("Solo se pueden calificar casos resueltos o cerrados");
  if (await prisma.calificacion.findUnique({ where: { casoId: id } })) throw AppError.conflict("El caso ya fue calificado");
  const c = await prisma.calificacion.create({
    data: { casoId: id, usuarioId: actor.userId, puntuacion: d.puntuacion, comentario: d.comentario },
  });
  await auditar(actor, {
    accion: "CASO_CALIFICADO",
    entidad: "caso",
    entidadId: id,
    usuarioId: actor.userId,
    datos: { puntuacion: d.puntuacion },
  });
  return c;
}

// ───────────── Evidencias ─────────────
export async function puedeAdjuntar(id: number, actor: Actor) {
  const caso = await cargarAutorizado(id, actor);
  if (caso.estado === "CERRADO") throw AppError.conflict("El caso está cerrado y no admite evidencias");
  return caso;
}

export async function registrarEvidencias(
  id: number,
  actor: Actor,
  archivos: { originalname: string; filename: string; mimetype: string; size: number }[],
) {
  const creadas = await prisma.$transaction(
    archivos.map((a) =>
      prisma.evidencia.create({
        data: {
          casoId: id,
          usuarioId: actor.userId,
          nombreArchivo: a.originalname.slice(0, 200),
          rutaArchivo: `${id}/${a.filename}`,
          tipoArchivo: a.mimetype,
          tamano: a.size,
        },
      }),
    ),
  );
  await prisma.historialCaso.create({
    data: {
      casoId: id,
      estadoAnterior: null,
      estadoNuevo: (await cargar(id)).estado,
      descripcion: `Se adjuntaron ${creadas.length} evidencia(s)`,
      usuarioId: actor.userId,
    },
  });
  await auditar(actor, {
    accion: "EVIDENCIA_ADJUNTADA",
    entidad: "caso",
    entidadId: id,
    usuarioId: actor.userId,
    datos: { cantidad: creadas.length },
  });
  return creadas;
}

export async function listarEvidencias(id: number, actor: Actor) {
  await cargarAutorizado(id, actor);
  return prisma.evidencia.findMany({ where: { casoId: id }, orderBy: { id: "asc" } });
}

export async function evidenciaParaDescarga(id: number, evidenciaId: number, actor: Actor) {
  await cargarAutorizado(id, actor);
  const e = await prisma.evidencia.findFirst({ where: { id: evidenciaId, casoId: id } });
  if (!e) throw AppError.notFound("Evidencia no encontrada");
  return e;
}
