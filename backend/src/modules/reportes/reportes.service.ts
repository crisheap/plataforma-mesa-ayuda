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

export const whereCasos = (f: RangoFiltro): Prisma.CasoWhereInput => ({
  ...(f.tecnicoId ? { tecnicoId: f.tecnicoId } : {}),
  ...(f.prioridad ? { prioridad: f.prioridad } : {}),
  ...(f.estado ? { estado: f.estado } : {}),
  ...(f.desde || f.hasta ? { fechaCreacion: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
});

/** Indicadores clave (RF-ADM-03). */
export async function kpis(f: RangoFiltro) {
  const where = whereCasos(f);
  const [porEstado, porPrioridad, porTecnico, satisf, vencidosAbiertos] = await Promise.all([
    prisma.caso.groupBy({ by: ["estado"], where, _count: { _all: true } }),
    prisma.caso.groupBy({ by: ["prioridad"], where, _count: { _all: true } }),
    prisma.caso.groupBy({ by: ["tecnicoId"], where: { ...where, tecnicoId: { not: null } }, _count: { _all: true } }),
    prisma.calificacion.aggregate({ where: { caso: where }, _avg: { puntuacion: true }, _count: { _all: true } }),
    prisma.caso.count({ where: { ...where, slaVenceEn: { lte: new Date() }, estado: { in: ["ABIERTO", "ASIGNADO", "EN_PROCESO"] } } }),
  ]);

  // Tiempo medio de resolución y cumplimiento de SLA sobre los casos del filtro.
  const cond = Prisma.sql`1=1
    ${f.desde ? Prisma.sql`AND "fechaCreacion" >= ${f.desde}` : Prisma.empty}
    ${f.hasta ? Prisma.sql`AND "fechaCreacion" <= ${f.hasta}` : Prisma.empty}
    ${f.tecnicoId ? Prisma.sql`AND "tecnicoId" = ${f.tecnicoId}` : Prisma.empty}
    ${f.prioridad ? Prisma.sql`AND "prioridad" = ${f.prioridad}::"Prioridad"` : Prisma.empty}
    ${f.estado ? Prisma.sql`AND "estado" = ${f.estado}::"EstadoCaso"` : Prisma.empty}`;
  const [agg] = await prisma.$queryRaw<{ promedio: number | null; cumplidos: bigint; incumplidos: bigint }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM ("fechaResolucion" - "fechaCreacion")) / 60) AS promedio,
      COUNT(*) FILTER (WHERE "slaVenceEn" IS NOT NULL AND "fechaResolucion" IS NOT NULL AND "fechaResolucion" <= "slaVenceEn") AS cumplidos,
      COUNT(*) FILTER (WHERE "slaVenceEn" IS NOT NULL AND (("fechaResolucion" IS NOT NULL AND "fechaResolucion" > "slaVenceEn")
            OR ("fechaResolucion" IS NULL AND "estado" IN ('ABIERTO','ASIGNADO','EN_PROCESO') AND "slaVenceEn" < NOW()))) AS incumplidos
    FROM "casos" WHERE ${cond}`;

  const tecnicos = await prisma.usuario.findMany({
    where: { id: { in: porTecnico.map((t) => t.tecnicoId!).filter(Boolean) } },
    select: { id: true, nombre: true, apellido: true },
  });
  const cumplidos = Number(agg?.cumplidos ?? 0),
    incumplidos = Number(agg?.incumplidos ?? 0);
  const total = porEstado.reduce((s, e) => s + e._count._all, 0);

  return {
    totalCasos: total,
    porEstado: Object.fromEntries(porEstado.map((e) => [e.estado, e._count._all])),
    porPrioridad: Object.fromEntries(porPrioridad.map((p) => [p.prioridad, p._count._all])),
    porTecnico: porTecnico
      .map((t) => {
        const u = tecnicos.find((x) => x.id === t.tecnicoId);
        return { tecnicoId: t.tecnicoId, tecnico: u ? nombreCompleto(u) : "—", casos: t._count._all };
      })
      .sort((a, b) => b.casos - a.casos),
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
    sla: semaforoSla(c),
    calificacion: c.calificacion?.puntuacion ?? null,
  }));
}
