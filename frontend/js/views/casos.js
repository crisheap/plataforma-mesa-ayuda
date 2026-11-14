import { api } from "../api.js";
import {
  h,
  montar,
  badgeEstado,
  badgePrioridad,
  badgeSla,
  fecha,
  minutos,
  paginador,
  vacio,
  cargando,
  errorBox,
  opciones,
  TIPOS,
} from "../ui.js";

const irACaso = (id) => {
  location.hash = `#/casos/${id}`;
};

export function tablaCasos(items, { mostrarSla = false, mostrarSolicitante = false, mostrarTecnico = false } = {}) {
  if (!items.length) return vacio("No hay casos para mostrar.");
  const cab = [
    "Número",
    "Título",
    "Tipo",
    "Prioridad",
    "Estado",
    ...(mostrarSolicitante ? ["Solicitante"] : []),
    ...(mostrarTecnico ? ["Técnico"] : []),
    ...(mostrarSla ? ["SLA"] : []),
    "Creado",
  ];
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      {},
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          cab.map((c) => h("th", { scope: "col" }, c)),
        ),
      ),
      h(
        "tbody",
        {},
        items.map((c) =>
          h(
            "tr",
            {
              class: "click",
              tabindex: "0",
              "aria-label": `Abrir caso ${c.numeroCaso}`,
              onclick: () => irACaso(c.id),
              onkeydown: (e) => {
                if (e.key === "Enter") irACaso(c.id);
              },
            },
            h("td", {}, h("strong", {}, c.numeroCaso)),
            h("td", {}, c.titulo),
            h("td", {}, TIPOS[c.tipo]),
            h("td", {}, badgePrioridad(c.prioridad)),
            h("td", {}, badgeEstado(c.estado)),
            mostrarSolicitante ? h("td", {}, c.usuario?.nombreCompleto) : null,
            mostrarTecnico ? h("td", {}, c.tecnico?.nombreCompleto ?? "Sin asignar") : null,
            mostrarSla
              ? h(
                  "td",
                  {},
                  badgeSla(c.sla.semaforo),
                  c.sla.minutosRestantes !== null
                    ? h(
                        "div",
                        { class: "small muted" },
                        c.sla.minutosRestantes < 0
                          ? `Vencido ${minutos(c.sla.minutosRestantes)}`
                          : `Quedan ${minutos(c.sla.minutosRestantes)}`,
                      )
                    : null,
                )
              : null,
            h("td", {}, fecha(c.fechaCreacion)),
          ),
        ),
      ),
    ),
  );
}

/** Lista con filtros y paginación; `ruta` es el endpoint base. */
function listaConFiltros({ ruta, titulo, accion, opcionesTabla, filtroTecnico = false }) {
  const estado = { page: 1, pageSize: 15, q: "", estado: "", prioridad: "", tecnicoId: "", slaVencido: false };
  const resultado = h("div", { "aria-live": "polite" });
  const q = h("input", { type: "search", placeholder: "Buscar por número, título o descripción", "aria-label": "Buscar casos" });
  const sEstado = h(
    "select",
    { "aria-label": "Filtrar por estado" },
    opciones(
      { ABIERTO: "Abierto", ASIGNADO: "Asignado", EN_PROCESO: "En proceso", RESUELTO: "Resuelto", CERRADO: "Cerrado" },
      "",
      "Todos los estados",
    ),
  );
  const sPrio = h(
    "select",
    { "aria-label": "Filtrar por prioridad" },
    opciones({ ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" }, "", "Todas las prioridades"),
  );
  const venc = h("input", { type: "checkbox", id: "venc" });
  const selTec = filtroTecnico
    ? h("select", { "aria-label": "Filtrar por técnico" }, h("option", { value: "" }, "Todos los técnicos"))
    : null;

  const cargar = async () => {
    montar(resultado, cargando());
    const p = new URLSearchParams({ page: estado.page, pageSize: estado.pageSize });
    for (const k of ["q", "estado", "prioridad", "tecnicoId"]) if (estado[k]) p.set(k, estado[k]);
    if (estado.slaVencido) p.set("slaVencido", "true");
    try {
      const d = await api(`${ruta}?${p}`);
      montar(
        resultado,
        tablaCasos(d.items, opcionesTabla),
        d.total > d.pageSize
          ? paginador(d.total, d.page, d.pageSize, (n) => {
              estado.page = n;
              cargar();
            })
          : h("p", { class: "muted small" }, `${d.total} caso(s)`),
      );
    } catch (e) {
      montar(resultado, errorBox(e));
    }
  };
  const filtrar = () => {
    estado.q = q.value.trim();
    estado.estado = sEstado.value;
    estado.prioridad = sPrio.value;
    estado.tecnicoId = selTec?.value ?? "";
    estado.slaVencido = venc.checked;
    estado.page = 1;
    cargar();
  };
  let t;
  q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(filtrar, 350);
  });
  for (const el of [sEstado, sPrio, venc, selTec].filter(Boolean)) el.addEventListener("change", filtrar);
  if (selTec)
    api("/api/usuarios/tecnicos")
      .then((ts) => {
        for (const x of ts) selTec.append(h("option", { value: x.id }, `${x.nombreCompleto} (${x.casosActivos})`));
      })
      .catch(() => undefined);

  cargar();
  return h(
    "div",
    {},
    h("div", { class: "page-title" }, h("h1", {}, titulo), accion),
    h(
      "div",
      { class: "card row" },
      h("div", { class: "grow" }, q),
      sEstado,
      sPrio,
      selTec,
      h("label", { class: "row", for: "venc", style: null }, venc, "Solo SLA vencido"),
    ),
    resultado,
  );
}

export const vistaMisCasos = () =>
  listaConFiltros({
    ruta: "/api/casos/mis-casos",
    titulo: "Mis casos",
    accion: h("a", { class: "btn primary", href: "#/casos/nuevo" }, "Nuevo caso"),
    opcionesTabla: { mostrarSla: false, mostrarTecnico: true },
  });
export const vistaAsignados = () =>
  listaConFiltros({
    ruta: "/api/casos/asignados",
    titulo: "Casos asignados a mí",
    opcionesTabla: { mostrarSla: true, mostrarSolicitante: true },
  });
export const vistaTodos = () =>
  listaConFiltros({
    ruta: "/api/casos",
    titulo: "Todos los casos",
    filtroTecnico: true,
    opcionesTabla: { mostrarSla: true, mostrarSolicitante: true, mostrarTecnico: true },
  });
