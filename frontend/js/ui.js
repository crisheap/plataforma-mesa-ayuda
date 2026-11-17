/* Utilidades de interfaz. Todo el texto dinámico se inserta con textContent (sin innerHTML). */
/**
 * Propiedades de un contenedor de tabla con desplazamiento horizontal: enfocable con el teclado
 * y anunciado como región (WCAG 2.1.1 y regla «scrollable-region-focusable» de axe).
 */
export const envolturaTabla = (nombre) => ({ class: "table-wrap", tabindex: "0", role: "region", "aria-label": nombre });

export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "required" || k === "multiple") el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  agregar(el, hijos);
  return el;
}
function agregar(el, hijos) {
  for (const c of hijos.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const montar = (contenedor, ...hijos) => {
  contenedor.replaceChildren();
  agregar(contenedor, hijos);
};

export function toast(mensaje, { accion, onAccion, ms = 4500 } = {}) {
  const cont = document.getElementById("toasts");
  const t = h("div", { class: "toast" }, h("span", {}, mensaje));
  if (accion)
    t.append(
      h(
        "button",
        {
          class: "btn sm",
          onclick: () => {
            onAccion?.();
            t.remove();
          },
        },
        accion,
      ),
    );
  cont.append(t);
  if (ms) setTimeout(() => t.remove(), ms);
  return t;
}

/** Diálogo modal accesible basado en <dialog>. Devuelve una promesa con el valor de cierre. */
export function modal({ titulo, cuerpo, acciones }) {
  return new Promise((resolver) => {
    const dlg = h("dialog", { "aria-labelledby": "dlg-t" });
    const cerrar = (v) => {
      dlg.close();
      dlg.remove();
      resolver(v);
    };
    const foot = h(
      "div",
      { class: "dlg-foot" },
      (acciones ?? [{ texto: "Cerrar", valor: null }]).map((a) =>
        h(
          "button",
          {
            class: `btn ${a.primario ? "primary" : ""} ${a.peligro ? "danger" : ""}`,
            type: "button",
            onclick: async () => {
              if (a.validar && !(await a.validar())) return;
              cerrar(typeof a.valor === "function" ? a.valor() : a.valor);
            },
          },
          a.texto,
        ),
      ),
    );
    dlg.append(h("div", { class: "dlg-body" }, h("h2", { id: "dlg-t" }, titulo), cuerpo), foot);
    dlg.addEventListener("cancel", () => {
      dlg.remove();
      resolver(null);
    });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector("input, textarea, select")?.focus();
  });
}
export const confirmar = (titulo, texto, textoOk = "Confirmar", peligro = false) =>
  modal({
    titulo,
    cuerpo: h("p", {}, texto),
    acciones: [
      { texto: "Cancelar", valor: false },
      { texto: textoOk, valor: true, primario: !peligro, peligro },
    ],
  });

export function campo(etiqueta, control, ayuda) {
  const id = control.id || `c-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, etiqueta), control, ayuda ? h("div", { class: "hint" }, ayuda) : null);
}

// ── Formato ──
const f = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
export const fecha = (d) => (d ? f.format(new Date(d)) : "—");
export function minutos(m) {
  if (m === null || m === undefined) return "—";
  const a = Math.abs(m),
    h2 = Math.floor(a / 60),
    mm = a % 60;
  const t = h2 >= 24 ? `${Math.floor(h2 / 24)} d ${h2 % 24} h` : h2 ? `${h2} h ${mm} min` : `${mm} min`;
  return m < 0 ? `hace ${t}` : t;
}
export const iniciales = (n = "") =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

const ESTADO = {
  ABIERTO: ["Abierto", "b-azul"],
  ASIGNADO: ["Asignado", "b-morado"],
  EN_PROCESO: ["En proceso", "b-ambar"],
  RESUELTO: ["Resuelto", "b-verde"],
  CERRADO: ["Cerrado", "b-gris"],
};
const PRIORIDAD = { ALTA: ["Alta", "b-rojo"], MEDIA: ["Media", "b-ambar"], BAJA: ["Baja", "b-verde"] };
const SLA = {
  EN_TIEMPO: ["En tiempo", "b-verde"],
  EN_RIESGO: ["En riesgo", "b-ambar"],
  VENCIDO: ["Vencido", "b-rojo"],
  CUMPLIDO: ["SLA cumplido", "b-verde"],
  INCUMPLIDO: ["SLA incumplido", "b-rojo"],
  SIN_SLA: ["Sin SLA", "b-gris"],
};
const badge = (mapa, v) => {
  const [t, c] = mapa[v] ?? [v, "b-gris"];
  return h("span", { class: `badge ${c}` }, t);
};
export const badgeEstado = (v) => badge(ESTADO, v);
export const badgePrioridad = (v) => badge(PRIORIDAD, v);
export const badgeSla = (v) => badge(SLA, v);
export const etiquetaEstado = (v) => ESTADO[v]?.[0] ?? v;

export const TIPOS = {
  INCIDENTE: "Incidente",
  REQUERIMIENTO: "Requerimiento",
  MANTENIMIENTO: "Mantenimiento",
  SOLICITUD_ACCESO: "Solicitud de acceso",
  OTROS: "Otros",
};
export const CATEGORIAS = {
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
  RED: "Red",
  CORREO: "Correo",
  PLATAFORMAS_INSTITUCIONALES: "Plataformas institucionales",
};
export const ROLES = { USUARIO: "Usuario", TECNICO: "Técnico", SUPERVISOR: "Supervisor", ADMINISTRADOR: "Administrador" };

export const opciones = (mapa, actual, vacio) => [
  vacio !== undefined ? h("option", { value: "" }, vacio) : null,
  ...Object.entries(mapa).map(([v, t]) => h("option", { value: v, selected: v === actual }, t)),
];

export function paginador(total, page, pageSize, onCambio) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  return h(
    "div",
    { class: "pager" },
    h("span", { class: "muted small" }, `${total} resultado(s) · página ${page} de ${paginas}`),
    h("button", { class: "btn sm", disabled: page <= 1, onclick: () => onCambio(page - 1) }, "Anterior"),
    h("button", { class: "btn sm", disabled: page >= paginas, onclick: () => onCambio(page + 1) }, "Siguiente"),
  );
}
export const vacio = (texto) => h("div", { class: "empty" }, texto);
export const cargando = () => h("div", { class: "empty", role: "status" }, "Cargando…");
export const errorBox = (e) => h("div", { class: "alert", role: "alert" }, e?.message ?? "Ocurrió un error inesperado");

/** Autoría de la plataforma: se muestra en el ingreso, en «Mi perfil» y en el menú. Ver LICENSE. */
export const AUTORIA = {
  autor: "Cristian Camilo Herrera Aponte",
  detalle: "Proyecto de grado · Universidad Antonio Nariño",
  anio: 2026,
  version: "2.2",
};
export const credito = (clase = "credito") => h("p", { class: clase }, `© ${AUTORIA.anio} ${AUTORIA.autor} · ${AUTORIA.detalle}`);
