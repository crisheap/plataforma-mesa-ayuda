import { type Request, Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/role.middleware";
import { auditar } from "../../core/audit";
import { validar } from "../../utils/validate";
import { casosParaExcel, kpis, MAX_FILAS_EXCEL, ZONA_HORARIA } from "./reportes.service";
import { esGeneral, filtroCentro } from "../../core/centros";

const VERDE = "FF2E7D00";
const cabecera = (fila: ExcelJS.Row) => {
  fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
  fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  fila.alignment = { vertical: "middle" };
};
const fechaCorta = (d: Date) => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: ZONA_HORARIA }).format(d);
const pct = (n: number, total: number) => (total ? n / total : 0);

const router = Router();
router.use(authenticate, authorizeRoles("SUPERVISOR", "ADMINISTRADOR"));

const filtros = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  tecnicoId: z.coerce.number().int().positive().optional(),
  centroId: z.coerce.number().int().positive().optional(),
  prioridad: z.enum(["ALTA", "MEDIA", "BAJA"]).optional(),
  estado: z.enum(["ABIERTO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO"]).optional(),
});

/** Filtros con el centro ya resuelto: el de la persona, o el que elija el administrador general (RF-CEN-02). */
const filtrosDe = (req: Request) => {
  const f = validar(filtros, req.query);
  return { ...f, centroId: filtroCentro({ rol: req.user!.rol, centroId: req.user!.centroId ?? null }, f.centroId).centroId };
};

/** La satisfacción (calificaciones y sus observaciones) solo la ve el administrador (RF-CAS-11). */
const veCalificaciones = (req: Request) => req.user!.rol === "ADMINISTRADOR";

router.get("/kpis", async (req, res) => {
  const k = await kpis(filtrosDe(req));
  res.json({ success: true, data: veCalificaciones(req) ? k : { ...k, satisfaccion: null } });
});

router.get("/casos.xlsx", async (req, res) => {
  const f = filtrosDe(req);
  const general = esGeneral({ rol: req.user!.rol, centroId: req.user!.centroId ?? null });
  const conCalificacion = veCalificaciones(req);
  const filas = (await casosParaExcel(f)).map((x) =>
    conCalificacion ? x : { ...x, calificacion: undefined, observacionCalificacion: undefined },
  );
  const resumen = await kpis(f);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma Mesa de Ayuda – SENA";
  wb.created = new Date();

  // Hoja 1 — Dashboard (RF-ADM-06): lo mismo que muestra la pantalla.
  const d = wb.addWorksheet("Dashboard", { properties: { tabColor: { argb: VERDE } } });
  d.columns = [{ width: 34 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  d.addRow(["Dashboard de casos – Plataforma Mesa de Ayuda SENA"]).font = { bold: true, size: 14 };
  const centroTxt = f.centroId ? resumen.porCentro.find((c) => c.centroId === f.centroId) : null;
  const filtrosTxt = [
    centroTxt ? `centro ${centroTxt.codigo} · ${centroTxt.nombre}` : general ? "todos los centros" : null,
    f.desde || f.hasta
      ? `Creados ${f.desde ? `desde ${fechaCorta(f.desde)}` : ""} ${f.hasta ? `hasta ${fechaCorta(f.hasta)}` : ""}`.trim()
      : "Todas las fechas",
    f.prioridad ? `prioridad ${f.prioridad}` : null,
    f.tecnicoId ? `técnico ${resumen.porTecnico.find((t) => t.tecnicoId === f.tecnicoId)?.tecnico ?? f.tecnicoId}` : null,
    f.estado ? `estado ${f.estado}` : null,
  ].filter(Boolean);
  d.addRow([`Filtros: ${filtrosTxt.join(" · ")}. Generado el ${fechaCorta(new Date())}.`]).font = {
    italic: true,
    color: { argb: "FF55655B" },
  };
  d.addRow([]);

  const rs = resumen.resumen;
  cabecera(d.addRow(["Casos", "Cantidad", "% del total"]));
  const ini = d.rowCount + 1;
  for (const [k, n] of [
    ["Total de casos", rs.total],
    ["Por realizar (abiertos y asignados)", rs.porRealizar],
    ["En proceso", rs.enProceso],
    ["Realizados (resueltos y cerrados)", rs.realizados],
    ["Vencidos (sin terminar y con el SLA vencido)", rs.vencidos],
    ["Resueltos fuera de tiempo", rs.resueltosFueraDeTiempo],
  ] as const) {
    const fila = d.addRow([k, n, pct(n, rs.total)]);
    fila.getCell(3).numFmt = "0.0%";
  }
  d.getRow(ini + 4).getCell(1).font = { bold: true, color: { argb: "FFB42318" } };
  d.addConditionalFormatting({
    ref: `B${ini + 1}:B${ini + 3}`,
    rules: [
      {
        type: "dataBar",
        priority: 1,
        cfvo: [{ type: "num", value: 0 }, { type: "max" }],
        color: { argb: "FF2A78D6" },
      } as unknown as ExcelJS.ConditionalFormattingOptions["rules"][number],
    ],
  });
  d.addRow([]);

  cabecera(d.addRow(["Indicador", "Valor"]));
  d.addRow(["Tiempo medio de resolución (min)", resumen.tiempoMedioResolucionMin ?? "—"]);
  d.addRow(["Cumplimiento de SLA (%)", resumen.cumplimientoSla.porcentaje ?? "—"]);
  if (conCalificacion) d.addRow(["Satisfacción promedio (1–5)", resumen.satisfaccion.promedio ?? "—"]);
  for (const [k, n] of Object.entries(resumen.porPrioridad)) d.addRow([`Prioridad ${k}`, n]);
  d.addRow([]);

  if (general && !f.centroId) {
    cabecera(d.addRow(["Centro", "Total", "Por realizar", "En proceso", "Realizados", "Vencidos"]));
    for (const c of resumen.porCentro)
      d.addRow([`${c.codigo} · ${c.nombre}`, c.casos, c.porRealizar, c.enProceso, c.realizados, c.vencidos]);
    d.addRow([]);
  }

  cabecera(d.addRow(["Técnico", "Total", "Por realizar", "En proceso", "Realizados", "Vencidos"]));
  for (const t of resumen.porTecnico) d.addRow([t.tecnico, t.casos, t.porRealizar, t.enProceso, t.realizados, t.vencidos]);
  d.addRow([]);

  const unidad = { day: "Día", week: "Semana del", month: "Mes" }[resumen.tendencia.unidad];
  cabecera(d.addRow([`Tendencia · ${unidad}`, "Creados", "Realizados"]));
  for (const p of resumen.tendencia.puntos) d.addRow([p.fecha, p.creados, p.realizados]);

  const hoja = wb.addWorksheet("Casos", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = [
    { header: "Número", key: "numero", width: 18 },
    { header: "Centro", key: "centro", width: 10 },
    { header: "Título", key: "titulo", width: 40 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Categoría", key: "categoria", width: 26 },
    { header: "Prioridad", key: "prioridad", width: 11 },
    { header: "Estado", key: "estado", width: 13 },
    { header: "Solicitante", key: "solicitante", width: 26 },
    { header: "Contacto", key: "contacto", width: 18 },
    { header: "Técnico", key: "tecnico", width: 26 },
    { header: "Creación", key: "creacion", width: 19 },
    { header: "Asignación", key: "asignacion", width: 19 },
    { header: "Resolución", key: "resolucion", width: 19 },
    { header: "Cierre", key: "cierre", width: 19 },
    { header: "SLA vence", key: "slaVence", width: 19 },
    { header: "Grupo", key: "grupo", width: 13 },
    { header: "SLA", key: "sla", width: 13 },
    ...(conCalificacion
      ? [
          { header: "Calificación", key: "calificacion", width: 12 },
          { header: "Observación de la calificación", key: "observacionCalificacion", width: 50 },
        ]
      : []),
  ];
  hoja.addRows(filas);
  cabecera(hoja.getRow(1));
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columns.length } };
  for (const k of ["creacion", "asignacion", "resolucion", "cierre", "slaVence"]) hoja.getColumn(k).numFmt = "yyyy-mm-dd hh:mm";

  const r = wb.addWorksheet("Resumen");
  r.columns = [
    { header: "Indicador", key: "k", width: 38 },
    { header: "Valor", key: "v", width: 22 },
  ];
  r.addRows([
    { k: "Total de casos", v: resumen.totalCasos },
    { k: "Por realizar", v: resumen.resumen.porRealizar },
    { k: "En proceso", v: resumen.resumen.enProceso },
    { k: "Realizados", v: resumen.resumen.realizados },
    { k: "Vencidos (sin terminar)", v: resumen.resumen.vencidos },
    { k: "Resueltos fuera de tiempo", v: resumen.resumen.resueltosFueraDeTiempo },
    ...Object.entries(resumen.porEstado).map(([k, v]) => ({ k: `Estado ${k}`, v })),
    ...Object.entries(resumen.porPrioridad).map(([k, v]) => ({ k: `Prioridad ${k}`, v })),
    { k: "Tiempo medio de resolución (min)", v: resumen.tiempoMedioResolucionMin ?? "—" },
    { k: "Cumplimiento de SLA (%)", v: resumen.cumplimientoSla.porcentaje ?? "—" },
    ...(conCalificacion ? [{ k: "Satisfacción promedio (1–5)", v: resumen.satisfaccion.promedio ?? "—" }] : []),
    { k: "Casos con SLA vencido (abiertos)", v: resumen.slaVencidosAbiertos },
    ...(filas.length >= MAX_FILAS_EXCEL ? [{ k: "Aviso", v: `Limitado a ${MAX_FILAS_EXCEL} filas` }] : []),
  ]);
  cabecera(r.getRow(1));

  await auditar(req, { accion: "REPORTE_GENERADO", entidad: "reporte", datos: { ...f, filas: filas.length } });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="casos-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

export default router;
