import { api } from "../api.js";
import { h, montar, campo, toast, fecha, vacio, paginador, cargando, errorBox, ROLES, AUTORIA, ENLACES_LEGALES } from "../ui.js";
import * as tema from "../theme.js";
import { puedeInstalar, instalar, estaInstalada, alCambiarInstalable, estadoPush, activarPush, desactivarPush } from "../pwa.js";

export async function vistaPerfil() {
  const p = await api("/api/auth/me");
  const sel = h(
    "select",
    { id: "tema", "aria-label": "Tema" },
    ...[
      ["sistema", "Seguir al sistema"],
      ["claro", "Claro (diurno)"],
      ["oscuro", "Oscuro (nocturno)"],
    ].map(([v, t]) => h("option", { value: v, selected: tema.preferencia() === v }, t)),
  );
  sel.addEventListener("change", async () => {
    await tema.fijar(sel.value);
    toast("Tema guardado en tu perfil");
  });

  const actual = h("input", { type: "password", autocomplete: "current-password" }),
    nueva = h("input", { type: "password", autocomplete: "new-password" }),
    rep = h("input", { type: "password", autocomplete: "new-password" });
  const err = h("div", { class: "alert hidden", role: "alert" });
  const form = h(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        err.classList.add("hidden");
        if (nueva.value !== rep.value) {
          err.textContent = "Las contraseñas nuevas no coinciden";
          err.classList.remove("hidden");
          return;
        }
        try {
          await api("/api/auth/password", { method: "PATCH", body: { passwordActual: actual.value, passwordNueva: nueva.value } });
          toast("Contraseña actualizada. Vuelve a iniciar sesión.");
          const { logout } = await import("../api.js");
          await logout();
        } catch (er) {
          err.textContent = [er.message, ...(er.errors ?? []).map((x) => x.message)].join(" · ");
          err.classList.remove("hidden");
        }
      },
    },
    err,
    campo("Contraseña actual", actual),
    campo("Nueva contraseña", nueva, "Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo."),
    campo("Repite la nueva contraseña", rep),
    h("button", { class: "btn primary", type: "submit" }, "Cambiar contraseña"),
  );

  const instalacion = h("div", {});
  const pintarInstal = () =>
    montar(
      instalacion,
      estaInstalada()
        ? h("p", { class: "muted" }, "La aplicación ya está instalada en este dispositivo.")
        : puedeInstalar()
          ? h(
              "button",
              {
                class: "btn primary",
                onclick: async () => {
                  await instalar();
                },
              },
              "Instalar aplicación",
            )
          : h(
              "p",
              { class: "muted small" },
              "Tu navegador mostrará la opción «Instalar» o «Añadir a la pantalla de inicio» cuando esté disponible.",
            ),
    );
  pintarInstal();
  alCambiarInstalable(pintarInstal);

  const push = h("div", {});
  const pintarPush = async () => {
    const e = await estadoPush().catch(() => ({ soportado: false }));
    if (!e.soportado) return montar(push, h("p", { class: "muted small" }, "Este navegador no admite notificaciones push."));
    if (!e.habilitado)
      return montar(push, h("p", { class: "muted small" }, "Las notificaciones push no están habilitadas en el servidor."));
    montar(
      push,
      e.activa
        ? h(
            "button",
            {
              class: "btn",
              onclick: async () => {
                await desactivarPush();
                toast("Notificaciones push desactivadas");
                pintarPush();
              },
            },
            "Desactivar notificaciones push",
          )
        : h(
            "button",
            {
              class: "btn primary",
              onclick: async () => {
                try {
                  await activarPush();
                  toast("Notificaciones push activadas");
                } catch (er) {
                  toast(er.message, { ms: 7000 });
                }
                pintarPush();
              },
            },
            "Activar notificaciones push",
          ),
    );
  };
  pintarPush();

  return h(
    "div",
    {},
    h("div", { class: "page-title" }, h("h1", {}, "Mi perfil")),
    h(
      "div",
      { class: "grid cols-2" },
      h(
        "section",
        { class: "card" },
        h("h2", {}, p.nombreCompleto),
        h(
          "dl",
          {},
          h("dt", { class: "muted small" }, "Correo"),
          h("dd", { style: null }, p.correo),
          h("dt", { class: "muted small" }, "Rol"),
          h("dd", { style: null }, ROLES[p.rol]),
          h("dt", { class: "muted small" }, "Último acceso"),
          h("dd", { style: null }, fecha(p.ultimoAcceso)),
        ),
      ),
      h(
        "section",
        { class: "card stack" },
        h("h2", {}, "Apariencia"),
        campo("Tema de la interfaz", sel, "Modo diurno, nocturno o el que use tu dispositivo."),
      ),
      h("section", { class: "card stack" }, h("h2", {}, "Aplicación"), instalacion, h("h3", {}, "Notificaciones push"), push),
      h("section", { class: "card" }, h("h2", {}, "Cambiar contraseña"), form),
      h(
        "section",
        { class: "card stack" },
        h("h2", {}, "Acerca de la plataforma"),
        h("p", {}, `Plataforma Mesa de Ayuda – SENA, versión ${AUTORIA.version}.`),
        h("p", {}, "Desarrollada por ", h("strong", {}, AUTORIA.autor), ` como ${AUTORIA.detalle.toLowerCase()}, ${AUTORIA.anio}.`),
        h(
          "p",
          { class: "muted small" },
          `© ${AUTORIA.anio} ${AUTORIA.autor}. Distribuida bajo la `,
          h("a", { href: ENLACES_LEGALES.licencia, target: "_blank", rel: "noopener" }, "licencia MIT"),
          ".",
        ),
        h("p", {}, h("a", { href: ENLACES_LEGALES.manual, target: "_blank", rel: "noopener" }, "Abrir el manual de usuario (PDF)")),
      ),
      h(
        "section",
        { class: "card stack" },
        h("h2", {}, "Tus datos personales"),
        p.autorizacionDatos?.fecha
          ? h(
              "p",
              {},
              `Autorizaste el tratamiento de tus datos el ${fecha(p.autorizacionDatos.fecha)} (política versión ${p.autorizacionDatos.version}).`,
            )
          : h("p", {}, "Aún no has autorizado el tratamiento de tus datos."),
        h(
          "p",
          {},
          "Para consultar, actualizar o suprimir tus datos, o revocar la autorización, sigue los pasos de la ",
          h("a", { href: ENLACES_LEGALES.privacidad }, "política de tratamiento de datos personales"),
          ".",
        ),
      ),
    ),
  );
}

export async function vistaNotificaciones() {
  const lista = h("div", { "aria-live": "polite" });
  const f = { page: 1 };
  const cargar = async () => {
    montar(lista, cargando());
    try {
      const d = await api(`/api/notificaciones?page=${f.page}&pageSize=15`);
      montar(
        lista,
        d.items.length
          ? d.items.map((n) =>
              h(
                "a",
                {
                  class: "card",
                  href: n.casoId ? `#/casos/${n.casoId}` : n.tipo === "SEGURIDAD" ? "#/seguridad" : "#/notificaciones",
                  style: null,
                  onclick: () => {
                    if (!n.leida)
                      api(`/api/notificaciones/${n.id}/leida`, { method: "PATCH" }).then(() =>
                        document.dispatchEvent(new CustomEvent("notificaciones-actualizadas")),
                      );
                  },
                },
                h(
                  "div",
                  { class: "row between" },
                  h("strong", {}, n.titulo),
                  n.leida ? null : h("span", { class: "badge b-azul" }, "Nueva"),
                ),
                h("div", {}, n.mensaje),
                h("div", { class: "small muted" }, fecha(n.createdAt)),
              ),
            )
          : vacio("No tienes notificaciones."),
        d.total > 15
          ? paginador(d.total, d.page, d.pageSize, (n) => {
              f.page = n;
              cargar();
            })
          : null,
      );
    } catch (e) {
      montar(lista, errorBox(e));
    }
  };
  cargar();
  return h(
    "div",
    {},
    h(
      "div",
      { class: "page-title" },
      h("h1", {}, "Notificaciones"),
      h(
        "button",
        {
          class: "btn",
          onclick: async () => {
            await api("/api/notificaciones/leer-todas", { method: "PATCH" });
            document.dispatchEvent(new CustomEvent("notificaciones-actualizadas"));
            cargar();
          },
        },
        "Marcar todas como leídas",
      ),
    ),
    lista,
  );
}
