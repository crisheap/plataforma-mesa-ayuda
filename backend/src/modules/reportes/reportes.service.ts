import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { nombreCompleto } from "../../utils/nombre";
import { semaforoSla } from "../../core/sla";

export interface RangoFiltro {
  desde?: Date;
  hasta?: Date;
  tecnicoId?: number;
  prioridad?: "ALTA" | "MEDIA" | "BAJA";
  estado?: "ABIERTO" | "ASIGNADO" | "EN_PROCESO" | "RESUELTO" | "CERRADO";
}

/** Agrupación del dashboard (RF-ADM-06): cada estado cae en un solo grupo. */
export type Grupo = "POR_REALIZAR" | "EN_PROCESO" | "REALIZADO";
export const GRUPOS: Record<Grupo, string> = { POR_REALIZAR: "Por realizar", EN_PROCESO: "En proceso", REALIZADO: "Realizado" };
export const grupoDeEstado = (e: string): Grupo =>
  e === "EN_PROCESO" ? "EN_PROCESO" : e === "RESUELTO" || e === "CERRADO" ? "REALIZADO" : "POR_REALIZAR";
const ABIERTOS = ["ABIERTO", "ASIGNADO", "EN_PROCESO"] as const;
export const ZONA_HORARIA = "America/Bogota";

/**
 * Ventana y unidad de la gráfica de tendencia. Sin «desde» se muestran los últimos 30 días.
 * Día hasta 62 días, semana hasta dos años y mes en adelante, para no pasar de ~100 puntos.
 */
export function ventanaTendencia(f: { desde?: Date; hasta?: Date }, ahora = new Date()) {
  const hasta = f.hasta ?? ahora;
  const desde = f.desde ?? new Date(hasta.getTime() - 29 * 86_400_000);
  const dias = (hasta.getTime() - desde.getTime()) / 86_400_000;
  const unidad: "day" | "week" | "month" = dias <= 62 ? "day" : dias <= 730 ? "week" : "month";
  return { desde, hasta, unidad };
}

export const whereCasos = (f: RangoFiltro): Prisma.CasoWhereInput => ({
  ...(f.tecnicoId ? { tecnicoId: f.tecnicoId } : {}),
  ...(f.prioridad ? { prioridad: f.prioridad } : {}),
  ...(f.estado ? { estado: f.estado } : {}),
  ...(f.desde || f.hasta ? { fechaCreacion: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
});

/** Indicadores clave (RF-ADM-03). */
export async function kpis(f: RangoFiltro) {
  const where = whereCasos(f);
  const ahora = new Date();
  const vencidos: Prisma.CasoWhereInput = { ...where, slaVenceEn: { lte: ahora }, estado: { in: [...ABIERTOS] } };
  const [porEstado, porPrioridad, porTecnicoEstado, satisf, vencidosAbiertos, vencidosTecnico] = await Promise.all([
    prisma.caso.groupBy({ by: ["estado"], where, _count: { _all: true } }),
    prisma.caso.groupBy({ by: ["prioridad"], where, _count: { _all: true } }),
    prisma.caso.groupBy({ by: ["tecnicoId", "estado"], where, _count: { _all: true } }),
    prisma.calificacion.aggregate({ where: { caso: where }, _avg: { puntuacion: true }, _count: { _all: true } }),
    prisma.caso.count({ where: vencidos }),
    prisma.caso.groupBy({ by: ["tecnicoId"], where: vencidos, _count: { _all: true } }),
  ]);

  // Tiempo medio de resolución y cumplimiento de SLA sobre los casos del filtro.
  const cond = Prisma.sql`1=1
    ${f.desde ? Prisma.sql`AND "fechaCreacion" >= ${f.desde}` : Prisma.empty}
    ${f.hasta ? Prisma.sql`AND "fechaCreacion" <= ${f.hasta}` : Prisma.empty}
    ${f.tecnicoId ? Prisma.sql`AND "tecnicoId" = ${f.tecnicoId}` : Prisma.empty}
    ${f.prioridad ? Prisma.sql`AND "prioridad" = ${f.prioridad}::"Prioridad"` : Prisma.empty}
    ${f.estado ? Prisma.sql`AND "estado" = ${f.estado}::"EstadoCaso"` : Prisma.empty}`;
  const [agg] = await prisma.$queryRaw<{ promedio: number | null; cumplidos: bigint; incumplidos: bigint; fueraDeTiempo: bigint }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM ("fechaResolucion" - "fechaCreacion")) / 60) AS promedio,
      COUNT(*) FILTER (WHERE "slaVenceEn" IS NOT NULL AND "fechaResolucion" IS NOT NULL AND "fechaResolucion" > "slaVenceEn") AS "fueraDeTiempo",
      COUNT(*) FILTER (WHERE "slaVenceEn" IS NOT NULL AND "fechaResolucion" IS NOT NULL AND "fechaResolucion" <= "slaVenceEn") AS cumplidos,
      COUNT(*) FILTER (WHERE "slaVenceEn" IS NOT NULL AND (("fechaResolucion" IS NOT NULL AND "fechaResolucion" > "slaVenceEn")
            OR ("fechaResolucion" IS NULL AND "estado" IN ('ABIERTO','ASIGNADO','EN_PROCESO') AND "slaVenceEn" < NOW()))) AS incumplidos
    FROM "casos" WHERE ${cond}`;

  // Tendencia: casos creados y realizados (resueltos) por día, semana o mes, en hora de Colombia.
  const v = ventanaTendencia(f, ahora);
  const condT = Prisma.sql`${f.tecnicoId ? Prisma.sql`AND "tecnicoId" = ${f.tecnicoId}` : Prisma.empty}
    ${f.prioridad ? Prisma.sql`AND "prioridad" = ${f.prioridad}::"Prioridad"` : Prisma.empty}`;
  const local = (col: Prisma.Sql) => Prisma.sql`date_trunc(${v.unidad}, (${col} AT TIME ZONE 'UTC') AT TIME ZONE ${ZONA_HORARIA})`;
  const puntos = await prisma.$queryRaw<{ fecha: string; creados: number; realizados: number }[]>`
    WITH ev AS (
      SELECT ${local(Prisma.sql`"fechaCreacion"`)} AS t, 1 AS c, 0 AS r FROM "casos"
        WHERE "fechaCreacion" >= ${v.desde} AND "fechaCreacion" <= ${v.hasta} ${condT}
      UNION ALL
      SELECT ${local(Prisma.sql`"fechaResolucion"`)}, 0, 1 FROM "casos"
        WHERE "fechaResolucion" >= ${v.desde} AND "fechaResolucion" <= ${v.hasta} ${condT}
    ), serie AS (
      SELECT generate_series(${local(Prisma.sql`${v.desde}::timestamp`)}, ${local(Prisma.sql`${v.hasta}::timestamp`)}, ('1 ' || ${v.unidad})::interval) AS t
    )
    SELECT to_char(s.t, 'YYYY-MM-DD') AS fecha, COALESCE(SUM(ev.c), 0)::int AS creados, COALESCE(SUM(ev.r), 0)::int AS realizados
    FROM serie s LEFT JOIN ev ON ev.t = s.t GROUP BY s.t ORDER BY s.t`;

  const idsTecnicos = [...new Set(porTecnicoEstado.map((t) => t.tecnicoId).filter((x): x is number => x != null))];
  const tecnicos = await prisma.usuario.findMany({
    where: { id: { in: idsTecnicos } },
    select: { id: true, nombre: true, apellido: true },
  });
  const filasTecnico = new Map<
    number | null,
    {
      tecnicoId: number | null;
      tecnico: string;
      casos: number;
      porRealizar: number;
      enProceso: number;
      realizados: number;
      vencidos: number;
    }
  >();
  for (const t of porTecnicoEstado) {
    const u = tecnicos.find((x) => x.id === t.tecnicoId);
    const fila = filasTecnico.get(t.tecnicoId) ?? {
      tecnicoId: t.tecnicoId,
      tecnico: t.tecnicoId == null ? "Sin asignar" : u ? nombreCompleto(u) : "—",
      casos: 0,
      porRealizar: 0,
      enProceso: 0,
      realizados: 0,
      vencidos: 0,
    };
    const n = t._count._all;
    fila.casos += n;
    const g = grupoDeEstado(t.estado);
    if (g === "POR_REALIZAR") fila.porRealizar += n;
    else if (g === "EN_PROCESO") fila.enProceso += n;
    else fila.realizados += n;
    filasTecnico.set(t.tecnicoId, fila);
  }
  for (const t of vencidosTecnico) {
    const fila = filasTecnico.get(t.tecnicoId);
    if (fila) fila.vencidos = t._count._all;
  }
  const cumplidos = Number(agg?.cumplidos ?? 0),
    incumplidos = Number(agg?.incumplidos ?? 0);
  const total = porEstado.reduce((s, e) => s + e._count._all, 0);
  const grupo = (g: Grupo) => porEstado.filter((e) => grupoDeEstado(e.estado) === g).reduce((s, e) => s + e._count._all, 0);

  return {
    totalCasos: total,
    resumen: {
      total,
      porRealizar: grupo("POR_REALIZAR"),
      enProceso: grupo("EN_PROCESO"),
      realizados: grupo("REALIZADO"),
      vencidos: vencidosAbiertos,
      resueltosFueraDeTiempo: Number(agg?.fueraDeTiempo ?? 0),
    },
    tendencia: { unidad: v.unidad, desde: v.desde, hasta: v.hasta, puntos },
    porEstado: Object.fromEntries(porEstado.map((e) => [e.estado, e._count._all])),
    porPrioridad: Object.fromEntries(porPrioridad.map((p) => [p.prioridad, p._count._all])),
    // Técnicos de mayor a menor carga; «Sin asignar» siempre al final.
    porTecnico: [...filasTecnico.values()].sort((a, b) => Number(a.tecnicoId == null) - Number(b.tecnicoId == null) || b.casos - a.casos),
    tiempoMedioResolucionMin: agg?.promedio == null ? null : Math.round(Number(agg.promedio)),
    cumplimientoSla: {
      cumplidos,
      incumplidos,
      porcentaje: cumplidos + incumplidos ? Math.round((cumplidos / (cumplidos + incumplidos)) * 1000) / 10 : null,
    },
    satisfaccion: {
      promedio: satisf._avg.puntuacion ? Math.round(satisf._avg.puntuacion * 100) / 100 : null,
      calificaciones: satisf._count._all,
    },
    slaVencidosAbiertos: vencidosAbiertos,
  };
}

export const MAX_FILAS_EXCEL = 20_000;

export async function casosParaExcel(f: RangoFiltro) {
  const casos = await prisma.caso.findMany({
    where: whereCasos(f),
    orderBy: { fechaCreacion: "desc" },
    take: MAX_FILAS_EXCEL,
    include: {
      usuario: { select: { nombre: true, apellido: true } },
      tecnico: { select: { nombre: true, apellido: true } },
      calificacion: { select: { puntuacion: true } },
    },
  });
  return casos.map((c) => ({
    numero: c.numeroCaso,
    titulo: c.titulo,
    tipo: c.tipo,
    categoria: c.categoria,
    prioridad: c.prioridad,
    estado: c.estado,
    solicitante: nombreCompleto(c.usuario),
    contacto: c.telefonoContacto ?? "",
    tecnico: c.tecnico ? nombreCompleto(c.tecnico) : "",
    creacion: c.fechaCreacion,
    asignacion: c.fechaAsignacion,
    resolucion: c.fechaResolucion,
    cierre: c.fechaCierre,
    slaVence: c.slaVenceEn,
    grupo: GRUPOS[grupoDeEstado(c.estado)],
    sla: semaforoSla(c),
    calificacion: c.calificacion?.puntuacion ?? null,
  }));
}
