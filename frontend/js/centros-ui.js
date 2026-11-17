/** Utilidades de centros para las vistas (RF-CEN-02). */
import { api } from "./api.js";
import { h } from "./ui.js";

let cache = null;
/** Centros visibles para quien consulta (el general, todos; los demás, el suyo). Se guarda en memoria. */
export function listarCentros({ refrescar = false } = {}) {
  if (!cache || refrescar) cache = api("/api/centros").catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}
export const olvidarCentros = () => {
  cache = null;
};

/**
 * Selector de centro para el administrador general. `todos`: texto de la opción vacía
 * (null = sin opción vacía, el centro es obligatorio). Llama a `alCargar` cuando ya tiene opciones.
 */
export function selectorCentro({ todos = "Todos los centros", etiqueta = "Filtrar por centro", valor = "", soloActivos = false, alCargar } = {}) {
  const sel = h("select", { "aria-label": etiqueta }, todos === null ? h("option", { value: "" }, "Elige un centro…") : h("option", { value: "" }, todos));
  listarCentros()
    .then((cs) => {
      for (const c of cs)
        if (!soloActivos || c.activo || String(c.id) === String(valor))
          sel.append(h("option", { value: c.id, selected: String(c.id) === String(valor) }, `${c.codigo} · ${c.nombre}${c.activo ? "" : " (inactivo)"}`));
      alCargar?.(cs);
    })
    .catch(() => undefined);
  return sel;
}

export const etiquetaCentro = (c) => (c ? h("span", { class: "badge b-azul", title: c.nombre }, c.codigo) : h("span", { class: "badge b-morado" }, "General"));
