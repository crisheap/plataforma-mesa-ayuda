/**
 * Centros de formación (RF-CEN-01) — solo el administrador general.
 * Crea los centros (CEET, CMTC…) y desde aquí abre la creación del administrador de cada uno.
 */
import { api } from "../api.js";
import { olvidarCentros } from "../centros-ui.js";
import { h, montar, modal, campo, toast, vacio, cargando, errorBox, envolturaTabla } from "../ui.js";

const msgs = (e) => (e.errors?.length ? e.errors.map((x) => x.message).join(" · ") : e.message);

export async function vistaCentros() {
  const lista = h("div", { "aria-live": "polite" });

  const cargar = async () => {
    montar(lista, cargando());
    try {
      const cs = await api("/api/centros");
      if (!cs.length) {
        montar(lista, vacio("Aún no hay centros. Crea el primero (por ejemplo CEET) y luego su administrador."));
        return;
      }
      montar(
        lista,
        h(
          "div",
          envolturaTabla("Centros de formación"),
          h(
            "table",
            {},
            h(
              "thead",
              {},
              h(
                "tr",
                {},
                ["Código", "Nombre", "Estado", "Administradores", "Usuarios", "Casos", "Acciones"].map((c) => h("th", { scope: "col" }, c)),
              ),
            ),
            h(
              "tbody",
              {},
              cs.map((c) =>
                h(
                  "tr",
                  {},
                  h("td", {}, h("strong", {}, c.codigo)),
                  h("td", {}, c.nombre),
                  h("td", {}, h("span", { class: `badge ${c.activo ? "b-verde" : "b-gris"}` }, c.activo ? "Activo" : "Inactivo")),
                  h("td", {}, c.administradores ? String(c.administradores) : h("span", { class: "badge b-ambar" }, "Sin administrador")),
                  h("td", {}, String(c.usuarios)),
                  h(
                    "td",
                    {},
                    `${c.casos}`,
                    c.casosSinTerminar ? h("div", { class: "small muted" }, `${c.casosSinTerminar} sin terminar`) : null,
                  ),
                  h(
                    "td",
                    {},
                    h(
                      "div",
                      { class: "row" },
                      c.activo
                        ? h("a", { class: "btn sm primary", href: `#/usuarios?nuevo=ADMINISTRADOR&centro=${c.id}` }, "Crear administrador")
                        : null,
                      h("a", { class: "btn sm", href: `#/usuarios?centro=${c.id}` }, "Ver usuarios"),
                      h("button", { class: "btn sm", type: "button", onclick: () => editar(c) }, "Editar"),
                      h(
                        "button",
                        { class: `btn sm${c.activo ? " danger" : ""}`, type: "button", onclick: () => cambiarActivo(c) },
                        c.activo ? "Inactivar" : "Activar",
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    } catch (e) {
      montar(lista, errorBox(e));
    }
  };

  async function crear() {
    const codigo = h("input", { maxlength: "10", autocomplete: "off", placeholder: "CEET", class: "mayus" });
    const nombre = h("input", {
      maxlength: "150",
      autocomplete: "off",
      placeholder: "Centro de Electricidad, Electrónica y Telecomunicaciones",
    });
    let creado = null;
    const c = await modal({
      titulo: "Nuevo centro",
      cuerpo: h(
        "div",
        {},
        campo(
          "Código",
          codigo,
          "De 2 a 10 letras o números, empezando por una letra. Es el prefijo de los casos (CEET-2026-000001) y no se puede cambiar.",
        ),
        campo("Nombre del centro", nombre),
      ),
      acciones: [
        { texto: "Cancelar", valor: null },
        {
          texto: "Crear centro",
          primario: true,
          // validar mantiene el diálogo abierto si el servidor rechaza los datos
          validar: async () => {
            try {
              creado = await api("/api/centros", { method: "POST", body: { codigo: codigo.value.trim(), nombre: nombre.value.trim() } });
              return true;
            } catch (e) {
              toast(msgs(e), { ms: 7000 });
              return false;
            }
          },
          valor: () => creado,
        },
      ],
    });
    if (!c) return;
    olvidarCentros();
    toast(`Centro ${c.codigo} creado. Ahora crea su administrador.`);
    location.hash = `#/usuarios?nuevo=ADMINISTRADOR&centro=${c.id}`;
  }

  async function editar(c) {
    const nombre = h("input", { maxlength: "150", value: c.nombre });
    const ok = await modal({
      titulo: `Editar ${c.codigo}`,
      cuerpo: h(
        "div",
        {},
        campo("Nombre del centro", nombre),
        h("p", { class: "small muted" }, "El código no se cambia porque identifica los casos ya registrados."),
      ),
      acciones: [
        { texto: "Cancelar", valor: null },
        {
          texto: "Guardar",
          primario: true,
          validar: async () => {
            try {
              await api(`/api/centros/${c.id}`, { method: "PATCH", body: { nombre: nombre.value.trim() } });
              return true;
            } catch (e) {
              toast(msgs(e), { ms: 7000 });
              return false;
            }
          },
          valor: true,
        },
      ],
    });
    if (ok) {
      olvidarCentros();
      toast("Centro actualizado");
      cargar();
    }
  }

  async function cambiarActivo(c) {
    const ok = await modal({
      titulo: c.activo ? `Inactivar ${c.codigo}` : `Activar ${c.codigo}`,
      cuerpo: h(
        "p",
        {},
        c.activo
          ? "Un centro inactivo no recibe usuarios ni casos nuevos. Sus cuentas y casos actuales se conservan y se pueden seguir atendiendo."
          : "El centro volverá a recibir usuarios y casos nuevos.",
      ),
      acciones: [
        { texto: "Cancelar", valor: null },
        { texto: c.activo ? "Inactivar" : "Activar", valor: true, primario: !c.activo, peligro: c.activo },
      ],
    });
    if (!ok) return;
    try {
      await api(`/api/centros/${c.id}`, { method: "PATCH", body: { activo: !c.activo } });
      olvidarCentros();
      toast(c.activo ? "Centro inactivado" : "Centro activado");
      cargar();
    } catch (e) {
      toast(msgs(e), { ms: 7000 });
    }
  }

  cargar();
  return h(
    "div",
    {},
    h(
      "div",
      { class: "page-title" },
      h("h1", {}, "Centros de formación"),
      h("button", { class: "btn primary", type: "button", onclick: crear }, "Nuevo centro"),
    ),
    h(
      "p",
      { class: "muted" },
      "Cada centro funciona de forma independiente: su administrador gestiona sus usuarios, técnicos y supervisores, y solo ve sus casos. Tú, como administrador general, ves todos los centros. Los tiempos de SLA y la base de Botito son comunes.",
    ),
    lista,
  );
}
