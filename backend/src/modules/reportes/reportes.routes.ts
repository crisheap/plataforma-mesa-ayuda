import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/role.middleware";
import { auditar } from "../../core/audit";
import { validar } from "../../utils/validate";
import { casosParaExcel, kpis, MAX_FILAS_EXCEL } from "./reportes.service";

const router = Router();
router.use(authenticate, authorizeRoles("SUPERVISOR", "ADMINISTRADOR"));

const filtros = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  tecnicoId: z.coerce.number().int().positive().optional(),
  prioridad: z.enum(["ALTA", "MEDIA", "BAJA"]).optional(),
  estado: z.enum(["ABIERTO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO"]).optional(),
});

router.get("/kpis", async (req, res) => {
  res.json({ success: true, data: await kpis(validar(filtros, req.query)) });
});

router.get("/casos.xlsx", async (req, res) => {
  const f = validar(filtros, req.query);
  const filas = await casosParaExcel(f);
  const resumen = await kpis(f);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma Mesa de Ayuda – SENA";
  wb.created = new Date();

  const hoja = wb.addWorksheet("Casos", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = [
    { header: "Número", key: "numero", width: 18 },
    { header: "Título", key: "titulo", width: 40 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Categoría", key: "categoria", width: 26 },
    { header: "Prioridad", key: "prioridad", width: 11 },
    { header: "Estado", key: "estado", width: 13 },
    { header: "Solicitante", key: "solicitante", width: 26 },
    { header: "Técnico", key: "tecnico", width: 26 },
    { header: "Creación", key: "creacion", width: 19 },
    { header: "Asignación", key: "asignacion", width: 19 },
    { header: "Resolución", key: "resolucion", width: 19 },
    { header: "Cierre", key: "cierre", width: 19 },
    { header: "SLA vence", key: "slaVence", width: 19 },
    { header: "SLA", key: "sla", width: 13 },
    { header: "Calificación", key: "calificacion", width: 12 },
  ];
  hoja.addRows(filas);
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D00" } };
  cab.alignment = { vertical: "middle" };
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columns.length } };
  for (const k of ["creacion", "asignacion", "resolucion", "cierre", "slaVence"]) hoja.getColumn(k).numFmt = "yyyy-mm-dd hh:mm";

  const r = wb.addWorksheet("Resumen");
  r.columns = [
    { header: "Indicador", key: "k", width: 38 },
    { header: "Valor", key: "v", width: 22 },
  ];
  r.addRows([
    { k: "Total de casos", v: resumen.totalCasos },
    ...Object.entries(resumen.porEstado).map(([k, v]) => ({ k: `Estado ${k}`, v })),
    ...Object.entries(resumen.porPrioridad).map(([k, v]) => ({ k: `Prioridad ${k}`, v })),
    { k: "Tiempo medio de resolución (min)", v: resumen.tiempoMedioResolucionMin ?? "—" },
    { k: "Cumplimiento de SLA (%)", v: resumen.cumplimientoSla.porcentaje ?? "—" },
    { k: "Satisfacción promedio (1–5)", v: resumen.satisfaccion.promedio ?? "—" },
    { k: "Casos con SLA vencido (abiertos)", v: resumen.slaVencidosAbiertos },
    ...(filas.length >= MAX_FILAS_EXCEL ? [{ k: "Aviso", v: `Limitado a ${MAX_FILAS_EXCEL} filas` }] : []),
  ]);
  r.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D00" } };

  await auditar(req, { accion: "REPORTE_GENERADO", entidad: "reporte", datos: { ...f, filas: filas.length } });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="casos-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

export default router;
