import {
  api,
  actualizarUsuarioLocal,
  alCambiarSesion,
  asegurarSesion,
  getUsuario,
  logout,
  restaurarSesion,
  vaciarCola,
  colaTotal,
} from "./api.js";
import { h, montar, toast, iniciales, ROLES, errorBox, cargando, pieLegal } from "./ui.js";
import { icono, iconoBot } from "./illustrations.js";
import * as tema from "./theme.js";
import { registrarServiceWorker } from "./pwa.js";
import { montarBot, desmontarBot } from "./bot.js";
import { vistaLogin, vistaCambioPasswordObligatorio } from "./views/login.js";
import { vistaActivar } from "./views/activar.js";
import { vistaPrivacidad, vistaAutorizacionDatos } from "./views/legal.js";
import { vistaInicio } from "./views/inicio.js";
import { vistaMisCasos, vistaAsignados, vistaTodos } from "./views/casos.js";
import { vistaCasoDetalle } from "./views/caso-detalle.js";
import { vistaCasoNuevo } from "./views/caso-nuevo.js";
import { vistaUsuarios, vistaSla, vistaAuditoria, vistaConocimiento, vistaConfiguracion } from "./views/admin.js";
import { vistaDashboard } from "./views/dashboard.js";
import { vistaCentros } from "./views/centros.js";
import { vistaPerfil, vistaNotificaciones } from "./views/cuenta.js";

const TODOS = ["USUARIO", "TECNICO", "SUPERVISOR", "ADMINISTRADOR"];
const STAFF = ["SUPERVISOR", "ADMINISTRADOR"];
/** Permisos por centro (RF-CEN-02): GENERAL = administrador sin centro; CON_CENTRO = cualquier cuenta de un centro. */
const GENERAL = ["GENERAL"];
const CON_CENTRO = ["CON_CENTRO"];
const permisos = (u) => [u.rol, u.esGeneral ? "GENERAL" : "CON_CENTRO"];
const puede = (u, roles) => permisos(u).some((p) => roles.includes(p));
/** Tabla de rutas: [patrón, vista, roles permitidos, título]. */
const RUTAS = [
  ["inicio", vistaInicio, TODOS, "Inicio"],
  ["casos/nuevo", vistaCasoNuevo, CON_CENTRO, "Nuevo caso"],
  ["mis-casos", vistaMisCasos, CON_CENTRO, "Mis casos"],
  ["asignados", vistaAsignados, ["TECNICO"], "Casos asignados"],
  ["casos", vistaTodos, STAFF, "Todos los casos"],
  ["casos/:id", vistaCasoDetalle, TODOS, "Detalle del caso"],
  ["notificaciones", vistaNotificaciones, TODOS, "Notificaciones"],
  ["perfil", vistaPerfil, TODOS, "Mi perfil"],
  ["dashboard", vistaDashboard, STAFF, "Dashboard"],
  ["reportes", vistaDashboard, STAFF, "Dashboard"],
  ["auditoria", vistaAuditoria, STAFF, "Bitácora de auditoría"],
  ["usuarios", vistaUsuarios, ["ADMINISTRADOR"], "Usuarios"],
  ["centros", vistaCentros, GENERAL, "Centros de formación"],
  ["sla", vistaSla, GENERAL, "Configuración de SLA"],
  ["conocimiento", vistaConocimiento, GENERAL, "Base de conocimiento"],
  ["configuracion", vistaConfiguracion, GENERAL, "Configuración"],
];
const NAV = [
  ["inicio", "🏠", "Inicio", TODOS],
  ["casos/nuevo", "➕", "Nuevo caso", CON_CENTRO],
  ["mis-casos", "📄", "Mis casos", CON_CENTRO],
  ["asignados", "🛠️", "Casos asignados", ["TECNICO"]],
  ["notificaciones", "🔔", "Notificaciones", TODOS],
  ["__sep", "", "Supervisión", STAFF],
  ["casos", "📋", "Todos los casos", STAFF],
  ["dashboard", "📊", "Dashboard", STAFF],
  ["auditoria", "🧾", "Auditoría", STAFF],
  ["__sep", "", "Administración", ["ADMINISTRADOR"]],
  ["centros", "🏫", "Centros", GENERAL],
  ["usuarios", "👥", "Usuarios", ["ADMINISTRADOR"]],
  ["sla", "⏱️", "SLA", GENERAL],
  ["conocimiento", "📚", "Base del asistente", GENERAL],
  ["configuracion", "⚙️", "Configuración", GENERAL],
  ["__sep", "", "Cuenta", TODOS],
  ["perfil", "👤", "Mi perfil", TODOS],
];

const root = document.getElementById("root");
let shell = null; // referencias al layout autenticado
let noLeidas = 0;

function resolverRuta(hash) {
  const ruta = hash.replace(/^#\/?/, "").split("?")[0] || "inicio";
  const partes = ruta.split("/");
  for (const [patron, vista, roles, titulo] of RUTAS) {
    const pp = patron.split("/");
    if (pp.length !== partes.length) continue;
    const params = {};
    const coincide = pp.every((p, i) => {
      if (!p.startsWith(":")) return p === partes[i];
      params[p.slice(1)] = partes[i];
      return true;
    });
    if (coincide) return { vista, roles, titulo, params, ruta };
  }
  return null;
}

// ───────────── Layout autenticado ─────────────
function construirShell(u) {
  const botTema = h("button", {
    class: "btn icon-btn",
    "aria-label": "Cambiar entre modo claro y oscuro",
    title: "Modo claro / oscuro",
    onclick: () => tema.alternar(),
  });
  const pintarTema = () => {
    botTema.replaceChildren(icono(tema.esOscuro() ? "sol" : "luna"));
  };
  pintarTema();
  document.addEventListener("tema-cambiado", pintarTema);

  const contador = h("span", { class: "count hidden", "aria-hidden": "true" });
  const campana = h(
    "a",
    { class: "btn icon-btn bell", href: "#/notificaciones", "aria-label": "Notificaciones" },
    icono("campana"),
    contador,
  );
  const nav = h("nav", { class: "nav", id: "nav", "aria-label": "Navegación principal" });
  const menu = h(
    "button",
    {
      class: "btn icon-btn menu-btn",
      "aria-label": "Abrir menú",
      "aria-expanded": "false",
      onclick: () => {
        const abierto = nav.classList.toggle("open");
        menu.setAttribute("aria-expanded", String(abierto));
      },
    },
    icono("menu"),
  );

  const chip = h(
    "div",
    { class: "user-chip", id: "usuario-chip" },
    h("div", { class: "avatar", "aria-hidden": "true" }, iniciales(u.nombreCompleto)),
    h(
      "div",
      { class: "who" },
      h("strong", { title: u.nombreCompleto }, u.nombreCompleto),
      h("small", {}, u.esGeneral ? "Administrador general" : `${ROLES[u.rol]} · ${u.centro?.codigo ?? ""}`),
    ),
  );

  const banner = h(
    "div",
    { class: "offline-banner hidden", role: "status" },
    "Sin conexión — puedes seguir redactando un caso; se enviará al reconectar.",
  );
  const main = h("main", { id: "contenido", tabindex: "-1" });

  const top = h(
    "header",
    { class: "topbar" },
    menu,
    h("a", { class: "brand", href: "#/inicio" }, h("span", { class: "logo" }, iconoBot(26)), "Mesa de Ayuda"),
    h("span", { class: "spacer" }),
    botTema,
    campana,
    chip,
    h(
      "button",
      {
        class: "btn sm",
        onclick: async () => {
          await logout();
        },
        title: "Cerrar sesión", // el nombre accesible es el texto visible «Salir» (WCAG 2.5.3)
      },
      "Salir",
    ),
  );

  // El pie con el manual, la política de datos y la licencia se ve en todas las pantallas, para todos los roles.
  montar(root, h("div", { class: "app" }, top, nav, h("div", { class: "contenido" }, banner, main, pieLegal())));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      nav.classList.remove("open");
      menu.setAttribute("aria-expanded", "false");
    }
  });

  const pintarNav = (actual) =>
    montar(
      nav,
      NAV.filter(([, , , roles]) => puede(u, roles)).map(([ruta, ic, texto]) =>
        ruta === "__sep"
          ? h("div", { class: "sep" }, texto)
          : h("a", { href: `#/${ruta}`, "aria-current": actual === ruta ? "page" : null }, h("span", { "aria-hidden": "true" }, ic), texto),
      ),
    );

  shell = { main, banner, contador, campana, pintarNav, chip };
  actualizarEstadoRed();
}

function pintarContador() {
  if (!shell) return;
  const texto = noLeidas > 99 ? "99+" : String(noLeidas);
  shell.contador.textContent = texto;
  shell.contador.classList.toggle("hidden", noLeidas === 0);
  // El nombre accesible incluye el número visible (WCAG 2.5.3, «etiqueta en el nombre»).
  shell.campana.setAttribute("aria-label", noLeidas ? `Notificaciones: ${texto} sin leer` : "Notificaciones");
}
export async function refrescarNotificaciones() {
  if (!getUsuario() || getUsuario().debeCambiarPassword || !navigator.onLine) return;
  try {
    noLeidas = (await api("/api/notificaciones?pageSize=1")).noLeidas;
    pintarContador();
  } catch {
    /* noop */
  }
}
document.addEventListener("notificaciones-actualizadas", refrescarNotificaciones);

function actualizarEstadoRed() {
  shell?.banner.classList.toggle("hidden", navigator.onLine);
}
window.addEventListener("offline", actualizarEstadoRed);
window.addEventListener("online", async () => {
  actualizarEstadoRed();
  await asegurarSesion();
  const n = await vaciarCola();
  if (n) {
    toast(`Se enviaron ${n} caso(s) guardados sin conexión`);
    if (location.hash.includes("mis-casos")) enrutar();
  }
  refrescarNotificaciones();
});

// ───────────── Enrutador ─────────────
let token = 0;
async function enrutar() {
  const u = getUsuario();
  const hash = location.hash || "#/";
  // Enlace de acceso del correo de bienvenida: página pública, con o sin sesión (RF-USU-10).
  if (hash.startsWith("#/activar")) {
    return montar(root, vistaActivar({ token: new URLSearchParams(hash.split("?")[1] ?? "").get("token") }));
  }
  // Política de datos personales: pública, con o sin sesión (RF-DAT-01).
  if (hash.startsWith("#/privacidad")) {
    shell = null;
    document.title = "Política de datos personales · Mesa de Ayuda SENA";
    return montar(root, vistaPrivacidad());
  }
  if (!u) {
    if (hash !== "#/login") history.replaceState(null, "", "#/login");
    return montar(root, vistaLogin({ alIngresar: despuesDeLogin }));
  }
  if (u.debeCambiarPassword)
    return montar(
      root,
      vistaCambioPasswordObligatorio({
        alTerminar: () => {
          enrutar();
        },
      }),
    );
  // Autorización previa, expresa e informada antes de usar la plataforma (Ley 1581 de 2012, art. 9).
  if (!u.autorizacionDatos?.vigente) {
    shell = null;
    return montar(
      root,
      vistaAutorizacionDatos({
        usuario: u,
        alAceptar: (perfil) => {
          actualizarUsuarioLocal(perfil);
          enrutar();
        },
      }),
    );
  }
  if (!shell || !root.contains(shell.main)) construirShell(u);
  if (hash === "#/login" || hash === "#/" || hash === "") {
    location.replace("#/inicio");
    return;
  }

  const r = resolverRuta(hash);
  const mi = ++token;
  shell.pintarNav(r?.ruta);
  if (!r) {
    montar(
      shell.main,
      h(
        "div",
        { class: "card center" },
        h("h1", {}, "Página no encontrada"),
        h("a", { class: "btn primary", href: "#/inicio" }, "Ir al inicio"),
      ),
    );
    return;
  }
  if (!puede(u, r.roles)) {
    montar(shell.main, h("div", { class: "alert", role: "alert" }, "No tienes permisos para ver esta sección."));
    return;
  }

  document.title = `${r.titulo} · Mesa de Ayuda SENA`;
  montar(shell.main, cargando());
  try {
    const nodo = await r.vista({ params: r.params, usuario: u, recargar: enrutar });
    if (mi !== token) return; // el usuario navegó a otra ruta mientras cargaba
    montar(shell.main, nodo);
    shell.main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    if (mi === token) montar(shell.main, errorBox(e));
  }
}

async function despuesDeLogin(u) {
  tema.aplicarDePerfil(u.preferenciaTema);
  location.hash = "#/inicio";
  enrutar();
}

alCambiarSesion((u) => {
  if (u?.debeCambiarPassword || (u && !u.autorizacionDatos?.vigente)) {
    desmontarBot();
    return;
  } // primero debe cambiar la contraseña temporal y autorizar el tratamiento de datos
  if (u) {
    montarBot();
    refrescarNotificaciones();
    vaciarCola().then((n) => n && toast(`Se enviaron ${n} caso(s) guardados sin conexión`));
    const chip = document.getElementById("usuario-chip");
    if (chip) chip.querySelector("strong").textContent = u.nombreCompleto;
  } else {
    desmontarBot();
    shell = null;
    noLeidas = 0;
    enrutar();
  }
});
window.addEventListener("hashchange", enrutar);
window.addEventListener("focus", refrescarNotificaciones);
setInterval(refrescarNotificaciones, 60_000);

// ───────────── Arranque ─────────────
(async function iniciar() {
  tema.aplicar();
  registrarServiceWorker((m) => {
    if (m?.tipo === "VACIAR_COLA") vaciarCola();
  });
  const u = await restaurarSesion().catch(() => null);
  if (u) tema.aplicarDePerfil(u.preferenciaTema);
  const activo = u && !u.debeCambiarPassword && u.autorizacionDatos?.vigente;
  if (activo) {
    montarBot();
    refrescarNotificaciones();
  }
  await enrutar();
  if (activo && (await colaTotal())) vaciarCola();
})();
