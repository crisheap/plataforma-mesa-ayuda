/**
 * Dashboard de casos (RF-ADM-06) — Supervisor y Administrador.
 * Total, por realizar, en proceso, realizados y vencidos; tendencia; carga por técnico.
 * El botón «Descargar Excel» entrega lo mismo (hoja Dashboard) con los filtros aplicados.
 */
import { api, descargar } from "../api.js";
import { h, montar, opciones, toast, vacio, cargando, errorBox, minutos } from "../ui.js";
import { apiladas, leyenda, lineas, muestra, num, segmentada, tablaDatos } from "../graficas.js";
import { selectorCentro } from "../centros-ui.js";

const GRUPOS = [
  { clave: "porRealizar", etiqueta: "Por realizar", detalle: "Abiertos y asignados", clase: "serie-1" },
  { clave: "enProceso", etiqueta: "En proceso", detalle: "Un técnico los está atendiendo", clase: "serie-2" },
  { clave: "realizados", etiqueta: "Realizados", detalle: "Resueltos y cerrados", clase: "serie-3" },
];
const PRIORIDADES = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };
const pct = (n, t) => (t ? `${Math.round((n / t) * 100)}%` : "0%");

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaFecha = (iso, unidad) => {
  const [a, m, d] = iso.split("-").map(Number);
  return unidad === "month" ? `${MESES[m - 1]} ${a}` : `${d} ${MESES[m - 1]}`;
};
const PERIODO = { day: "por día", week: "por semana", month: "por mes" };

function tarjeta(etiqueta, valor, { clase, detalle, alerta } = {}) {
  return h(
    "div",
    { class: `card tile${alerta ? " tile-alerta" : ""}` },
    h(
      "div",
      { class: "tile-l" },
      clase ? muestra(clase) : null,
      alerta ? h("span", { class: "icono-critico", "aria-hidden": "true" }, "⚠") : null,
      etiqueta,
    ),
    h("div", { class: "tile-n" }, num.format(valor)),
    detalle ? h("div", { class: "tile-d" }, detalle) : null,
  );
}

export async function vistaDashboard({ usuario }) {
  const general = usuario.esGeneral;
  // El general ve todos los centros o uno; los demás, siempre el suyo (RF-CEN-02).
  const centro = general ? selectorCentro() : null;
  const cont = h("div", { class: "dashboard-cuerpo" });
  const aviso = h("p", { class: "sr-only", "aria-live": "polite" });
  const desde = h("input", { type: "date", id: "dash-desde" }),
    hasta = h("input", { type: "date", id: "dash-hasta" });
  const prio = h("select", { "aria-label": "Prioridad" }, opciones(PRIORIDADES, "", "Todas las prioridades"));
  const tec = h("select", { "aria-label": "Técnico" }, h("option", { value: "" }, "Todos los técnicos"));
  const cargarTecnicos = () =>
    api(`/api/usuarios/tecnicos${centro?.value ? `?centroId=${centro.value}` : ""}`)
      .then((ts) => {
        tec.replaceChildren(
          h("option", { value: "" }, "Todos los técnicos"),
          ...ts.map((t) => h("option", { value: t.id }, t.nombreCompleto)),
        );
      })
      .catch(() => undefined);
  cargarTecnicos();
  const qs = () => {
    const p = new URLSearchParams();
    if (desde.value) p.set("desde", `${desde.value}T00:00:00`);
    if (hasta.value) p.set("hasta", `${hasta.value}T23:59:59`);
    if (prio.value) p.set("prioridad", prio.value);
    if (tec.value) p.set("tecnicoId", tec.value);
    if (centro?.value) p.set("centroId", centro.value);
    return p.toString();
  };

  const cargar = async () => {
    montar(cont, cargando());
    try {
      const k = await api(`/api/reportes/kpis?${qs()}`);
      const r = k.resumen;
      aviso.textContent = `Dashboard actualizado: ${r.total} casos, ${r.porRealizar} por realizar, ${r.enProceso} en proceso, ${r.realizados} realizados y ${r.vencidos} vencidos.`;

      // 1) Tarjetas
      const tarjetas = h(
        "div",
        { class: "grid cols-5" },
        tarjeta("Total de casos", r.total, { detalle: desde.value || hasta.value ? "En el periodo elegido" : "Desde el inicio" }),
        ...GRUPOS.map((g) => tarjeta(g.etiqueta, r[g.clave], { clase: g.clase, detalle: `${g.detalle} · ${pct(r[g.clave], r.total)}` })),
        tarjeta("Vencidos", r.vencidos, { alerta: true, detalle: "Sin terminar y con el plazo (SLA) vencido" }),
      );

      // 2) Reparto del total
      const reparto = h(
        "section",
        { class: "card" },
        h("h2", {}, "¿En qué van los casos?"),
        r.total
          ? [
              segmentada(
                GRUPOS.map((g) => ({ etiqueta: g.etiqueta, valor: r[g.clave], clase: g.clase })),
                `Reparto de ${r.total} casos: ${GRUPOS.map((g) => `${g.etiqueta.toLowerCase()} ${r[g.clave]}`).join(", ")}`,
              ),
              leyenda(GRUPOS.map((g) => ({ etiqueta: g.etiqueta, clase: g.clase, valor: r[g.clave], pct: pct(r[g.clave], r.total) }))),
              r.vencidos
                ? h(
                    "p",
                    { class: "nota-critica" },
                    h("span", { class: "icono-critico", "aria-hidden": "true" }, "⚠"),
                    ` ${num.format(r.vencidos)} de los ${num.format(r.porRealizar + r.enProceso)} casos sin terminar ya superaron su plazo.`,
                  )
                : null,
            ]
          : vacio("No hay casos con estos filtros."),
      );

      // 3) Tendencia
      const t = k.tendencia;
      const etqs = t.puntos.map((p) => etiquetaFecha(p.fecha, t.unidad));
      const series = [
        { etiqueta: "Creados", clase: "serie-7", valores: t.puntos.map((p) => p.creados) },
        { etiqueta: "Realizados", clase: "serie-3", valores: t.puntos.map((p) => p.realizados) },
      ];
      const rango = `${etiquetaFecha(t.puntos[0]?.fecha ?? "", t.unidad === "month" ? "month" : "day")} – ${etiquetaFecha(t.puntos.at(-1)?.fecha ?? "", t.unidad === "month" ? "month" : "day")}`;
      const tendencia = h(
        "section",
        { class: "card" },
        h("h2", {}, "Casos creados y realizados"),
        h(
          "p",
          { class: "muted small" },
          `${desde.value ? "" : "Últimos 30 días · "}${rango}, ${PERIODO[t.unidad]}. Usa las flechas del teclado para recorrer la gráfica.`,
        ),
        leyenda(series.map((x) => ({ etiqueta: x.etiqueta, clase: x.clase, valor: x.valores.reduce((a, b) => a + b, 0) }))),
        lineas({ series, etiquetas: etqs, descripcion: `Casos creados y realizados ${PERIODO[t.unidad]}, ${rango}` }),
        tablaDatos(
          "Casos creados y realizados",
          ["Fecha", "Creados", "Realizados"],
          t.puntos.map((p, i) => [etqs[i], p.creados, p.realizados]),
        ),
      );

      // 4) Por técnico
      const tecnicos = h(
        "section",
        { class: "card" },
        h("h2", {}, "Casos por técnico"),
        k.porTecnico.length
          ? [
              leyenda(GRUPOS.map((g) => ({ etiqueta: g.etiqueta, clase: g.clase }))),
              apiladas(
                k.porTecnico.map((f) => ({
                  etiqueta: f.tecnico,
                  total: f.casos,
                  partes: [f.porRealizar, f.enProceso, f.realizados],
                  extra: f.vencidos ? `${f.vencidos} vencidos` : "",
                  extraNodo: f.vencidos
                    ? h("span", { class: "badge b-rojo" }, `⚠ ${f.vencidos} vencido${f.vencidos === 1 ? "" : "s"}`)
                    : null,
                })),
                GRUPOS,
              ),
              tablaDatos(
                "Casos por técnico",
                ["Técnico", "Total", "Por realizar", "En proceso", "Realizados", "Vencidos"],
                k.porTecnico.map((f) => [f.tecnico, f.casos, f.porRealizar, f.enProceso, f.realizados, f.vencidos]),
              ),
            ]
          : vacio("Sin casos con estos filtros."),
      );

      // 5) Calidad del servicio y prioridad
      const sla = k.cumplimientoSla.porcentaje;
      const medidor = (valor, total, etiqueta) => {
        const b = h("span", { class: "fill" });
        b.style.width = `${total ? Math.round((valor / total) * 100) : 0}%`;
        return h("div", { class: "medidor", role: "img", "aria-label": etiqueta }, b);
      };
      const calidad = h(
        "section",
        { class: "card" },
        h("h2", {}, "Calidad del servicio"),
        h(
          "dl",
          { class: "indicadores" },
          h("dt", {}, "Cumplimiento de SLA"),
          h(
            "dd",
            {},
            h("strong", {}, sla === null ? "—" : `${sla}%`),
            sla === null ? null : medidor(sla, 100, `Cumplimiento de SLA ${sla}%`),
          ),
          h("dt", {}, "Tiempo medio de resolución"),
          h("dd", {}, h("strong", {}, minutos(k.tiempoMedioResolucionMin))),
          h("dt", {}, "Resueltos fuera de tiempo"),
          h("dd", {}, h("strong", {}, num.format(r.resueltosFueraDeTiempo))),
          // Solo el administrador recibe la satisfacción (RF-CAS-15)
          k.satisfaccion ? h("dt", {}, "Satisfacción") : null,
          k.satisfaccion
            ? h(
                "dd",
                {},
                h("strong", {}, k.satisfaccion.promedio ?? "—"),
                ` de 5 · ${num.format(k.satisfaccion.calificaciones)} calificaciones`,
              )
            : null,
        ),
        h("h3", {}, "Por prioridad"),
        h(
          "dl",
          { class: "indicadores" },
          Object.entries(PRIORIDADES).map(([key, et]) => {
            const n = k.porPrioridad[key] ?? 0;
            return [
              h("dt", {}, et),
              h("dd", {}, h("strong", {}, num.format(n)), medidor(n, r.total, `Prioridad ${et}: ${n} de ${r.total}`)),
            ];
          }),
        ),
      );

      // 6) Por centro: solo el administrador general, con todos los centros a la vista
      const porCentro =
        general && !centro.value && k.porCentro.length
          ? h(
              "section",
              { class: "card" },
              h("h2", {}, "Casos por centro"),
              leyenda(GRUPOS.map((g) => ({ etiqueta: g.etiqueta, clase: g.clase }))),
              apiladas(
                k.porCentro.map((c) => ({
                  etiqueta: `${c.codigo} · ${c.nombre}`,
                  total: c.casos,
                  partes: [c.porRealizar, c.enProceso, c.realizados],
                  extra: c.vencidos ? `${c.vencidos} vencidos` : "",
                  extraNodo: c.vencidos
                    ? h("span", { class: "badge b-rojo" }, `⚠ ${c.vencidos} vencido${c.vencidos === 1 ? "" : "s"}`)
                    : null,
                })),
                GRUPOS,
              ),
              tablaDatos(
                "Casos por centro",
                ["Centro", "Total", "Por realizar", "En proceso", "Realizados", "Vencidos"],
                k.porCentro.map((c) => [`${c.codigo} · ${c.nombre}`, c.casos, c.porRealizar, c.enProceso, c.realizados, c.vencidos]),
              ),
            )
          : null;

      montar(cont, tarjetas, reparto, porCentro, h("div", { class: "grid cols-2 dash-fila" }, tendencia, calidad), tecnicos);
    } catch (e) {
      montar(cont, errorBox(e));
    }
  };

  for (const el of [desde, hasta, prio, tec]) el.addEventListener("change", cargar);
  centro?.addEventListener("change", () => {
    tec.value = "";
    cargarTecnicos();
    cargar();
  });
  const limpiar = h(
    "button",
    {
      class: "btn sm",
      type: "button",
      onclick: () => {
        for (const el of [desde, hasta, prio, tec, centro].filter(Boolean)) el.value = "";
        cargar();
      },
    },
    "Limpiar filtros",
  );
  cargar();
  return h(
    "div",
    { class: "dashboard" },
    h(
      "div",
      { class: "page-title" },
      h("h1", {}, general ? "Dashboard" : `Dashboard · ${usuario.centro?.codigo ?? ""}`),
      h(
        "button",
        {
          class: "btn primary",
          type: "button",
          onclick: () =>
            descargar(`/api/reportes/casos.xlsx?${qs()}`, "casos.xlsx")
              .then(() => toast("Excel descargado con los filtros aplicados"))
              .catch((e) => toast(e.message)),
        },
        "Descargar Excel",
      ),
    ),
    h(
      "div",
      { class: "card row filtros" },
      h("label", { class: "row", for: "dash-desde" }, "Creados desde", desde),
      h("label", { class: "row", for: "dash-hasta" }, "hasta", hasta),
      centro,
      prio,
      tec,
      limpiar,
    ),
    aviso,
    cont,
  );
}
