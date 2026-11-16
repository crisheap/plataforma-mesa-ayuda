import { api } from "../api.js";
import { h, vacio, ROLES } from "../ui.js";
import { heroTecnico } from "../illustrations.js";
import { tablaCasos } from "./casos.js";

function bienvenida(u, texto) {
  return h(
    "section",
    { class: "welcome", "aria-label": "Bienvenida" },
    h("div", {}, h("h1", {}, `Bienvenido, ${u.nombreCompleto}`), h("p", {}, texto), h("p", { class: "small" }, `Rol: ${ROLES[u.rol]}`)),
    h("div", { class: "art" }, heroTecnico()),
  );
}
const kpi = (n, l) => h("div", { class: "card kpi" }, h("div", { class: "n" }, String(n ?? "—")), h("div", { class: "l" }, l));

export async function vistaInicio({ usuario: u }) {
  const raiz = h("div", {});
  if (u.rol === "USUARIO") {
    const d = await api("/api/casos/mis-casos?pageSize=50");
    const por = (e) => d.items.filter((c) => c.estado === e).length;
    const pendientes = d.items.filter((c) => c.estado === "RESUELTO");
    raiz.append(
      bienvenida(u, "¿Tienes un problema técnico? Reporta un caso o pregúntale a Botito, nuestro asistente."),
      h(
        "div",
        { class: "grid cols-4" },
        kpi(d.items.filter((c) => c.estado !== "CERRADO").length, "Casos activos"),
        kpi(por("EN_PROCESO"), "En proceso"),
        kpi(pendientes.length, "Por confirmar solución"),
        kpi(por("CERRADO"), "Cerrados"),
      ),
      h(
        "div",
        { class: "row" },
        h("a", { class: "btn primary", href: "#/casos/nuevo" }, "Reportar un caso"),
        h("a", { class: "btn", href: "#/mis-casos" }, "Ver todos mis casos"),
      ),
    );
    if (pendientes.length)
      raiz.append(
        h(
          "div",
          { class: "alert warn" },
          `Tienes ${pendientes.length} caso(s) con solución propuesta. Revísalos para cerrarlos o rechazarlos.`,
        ),
      );
    raiz.append(h("h2", {}, "Mis casos recientes"), tablaCasos(d.items.slice(0, 5)));
  } else if (u.rol === "TECNICO") {
    const d = await api("/api/casos/asignados?pageSize=50");
    const abiertos = d.items.filter((c) => ["ASIGNADO", "EN_PROCESO"].includes(c.estado));
    const riesgo = abiertos.filter((c) => ["EN_RIESGO", "VENCIDO"].includes(c.sla.semaforo));
    raiz.append(
      bienvenida(u, "Este es tu panel: primero lo más urgente según el tiempo de SLA."),
      h(
        "div",
        { class: "grid cols-4" },
        kpi(abiertos.length, "Casos por atender"),
        kpi(d.items.filter((c) => c.estado === "EN_PROCESO").length, "En proceso"),
        kpi(riesgo.length, "En riesgo / vencidos"),
        kpi(d.items.filter((c) => c.estado === "RESUELTO").length, "Esperando confirmación"),
      ),
      h("h2", {}, "Atender primero"),
      abiertos.length ? tablaCasos(abiertos.slice(0, 8), { mostrarSla: true }) : vacio("No tienes casos pendientes. ¡Buen trabajo!"),
      h("a", { class: "btn", href: "#/asignados" }, "Ver todos mis casos asignados"),
    );
  } else {
    const k = await api("/api/reportes/kpis");
    const pend = await api("/api/casos?estado=ABIERTO&pageSize=8");
    raiz.append(
      bienvenida(u, "Resumen operativo de la mesa de ayuda."),
      h(
        "div",
        { class: "grid cols-4" },
        kpi(k.totalCasos, "Casos totales"),
        kpi(k.porEstado.ABIERTO ?? 0, "Sin asignar"),
        kpi(k.slaVencidosAbiertos, "SLA vencido (abiertos)"),
        kpi(k.cumplimientoSla.porcentaje === null ? "—" : `${k.cumplimientoSla.porcentaje}%`, "Cumplimiento de SLA"),
      ),
      h("h2", {}, "Casos esperando asignación"),
      pend.items.length ? tablaCasos(pend.items, { mostrarSla: true, mostrarSolicitante: true }) : vacio("No hay casos sin asignar."),
      h(
        "div",
        { class: "row" },
        h("a", { class: "btn primary", href: "#/casos" }, "Gestionar casos"),
        h("a", { class: "btn", href: "#/dashboard" }, "Ver el dashboard"),
      ),
    );
  }
  return raiz;
}
