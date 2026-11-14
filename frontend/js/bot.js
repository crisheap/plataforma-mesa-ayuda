/* Asistente de IA «Botito»: ícono flotante y panel de conversación (RF-IA-01…08). */
import { api, getUsuario } from "./api.js";
import { h } from "./ui.js";
import { iconoBot, icono } from "./illustrations.js";

let fab = null,
  panel = null,
  msgs = null,
  chips = null,
  input = null,
  enviarBtn = null;
let conversacionId = null,
  iniciando = false;

export function montarBot() {
  if (fab || !getUsuario()) return;
  fab = h(
    "button",
    {
      class: "bot-fab",
      id: "bot-fab",
      "aria-label": "Abrir asistente de ayuda",
      "aria-expanded": "false",
      "aria-haspopup": "dialog",
      title: "¿Necesitas ayuda? Habla con Botito",
      onclick: alternar,
    },
    iconoBot(42),
  );
  document.body.append(fab);
}
export function desmontarBot() {
  fab?.remove();
  panel?.remove();
  fab = panel = msgs = chips = input = null;
  conversacionId = null;
}

function construirPanel() {
  msgs = h("div", { class: "bot-msgs", role: "log", "aria-live": "polite", "aria-label": "Conversación con el asistente" });
  chips = h("div", { class: "chips" });
  input = h("input", {
    type: "text",
    maxlength: "1500",
    placeholder: "Escribe tu problema…",
    "aria-label": "Mensaje para el asistente",
    autocomplete: "off",
  });
  enviarBtn = h("button", { class: "btn primary icon-btn", type: "submit", "aria-label": "Enviar mensaje" }, icono("enviar"));
  panel = h(
    "section",
    {
      class: "bot-panel hidden",
      role: "dialog",
      "aria-label": "Asistente de ayuda",
      onkeydown: (e) => {
        if (e.key === "Escape") cerrar();
      },
    },
    h(
      "div",
      { class: "bot-head" },
      iconoBot(34),
      h("div", { class: "t" }, h("strong", {}, "Botito"), h("small", {}, "Asistente automatizado · te ayudo paso a paso")),
      h("button", { class: "btn icon-btn sm", "aria-label": "Cerrar asistente", onclick: cerrar }, icono("cerrar")),
    ),
    msgs,
    h(
      "div",
      { class: "bot-aviso" },
      "Soy un asistente automatizado. Nunca compartas tu contraseña. ",
      h("button", { class: "chip", type: "button", onclick: () => crearCasoDesde(null) }, "Hablar con una persona"),
    ),
    h(
      "form",
      {
        class: "bot-foot",
        onsubmit: (e) => {
          e.preventDefault();
          enviar(input.value);
        },
      },
      input,
      enviarBtn,
    ),
  );
  document.body.append(panel);
}

function alternar() {
  panel && !panel.classList.contains("hidden") ? cerrar() : abrir();
}
function cerrar() {
  panel?.classList.add("hidden");
  fab?.setAttribute("aria-expanded", "false");
  fab?.focus();
}

async function abrir() {
  if (!panel) construirPanel();
  panel.classList.remove("hidden");
  fab.setAttribute("aria-expanded", "true");
  input.focus();
  if (conversacionId || iniciando) return;
  if (!navigator.onLine)
    return burbuja(
      "bot",
      "Necesito internet para ayudarte. Mientras tanto puedes crear un caso: se enviará cuando recuperes la conexión.",
      { acciones: [{ etiqueta: "Crear un caso", datos: null }] },
    );
  iniciando = true;
  try {
    const r = await api("/api/asistente/conversaciones", { method: "POST" });
    conversacionId = r.conversacion.id;
    burbuja("bot", r.saludo);
    mostrarSugerencias(r.sugerencias);
  } catch (e) {
    burbuja(
      "bot",
      e.sinConexion
        ? "No pude conectarme. Revisa tu internet e inténtalo de nuevo."
        : "No pude iniciar la conversación. Intenta de nuevo en unos minutos, o crea un caso para que un técnico te ayude.",
    );
  } finally {
    iniciando = false;
  }
}

function mostrarSugerencias(lista = []) {
  chips.replaceChildren(...lista.map((s) => h("button", { class: "chip", type: "button", onclick: () => enviar(s) }, s)));
  msgs.append(chips);
  bajar();
}
const bajar = () => {
  msgs.scrollTop = msgs.scrollHeight;
};

function burbuja(quien, texto, { id, acciones = [], fuentes = [] } = {}) {
  const el = h("div", { class: `msg ${quien}` }, texto);
  if (quien === "bot" && id) {
    el.append(
      h(
        "div",
        { class: "fb", role: "group", "aria-label": "¿Te ayudó esta respuesta?" },
        h(
          "button",
          { type: "button", "aria-label": "Me ayudó", title: "Me ayudó", onclick: (e) => valorar(id, true, e.currentTarget) },
          "👍",
        ),
        h(
          "button",
          { type: "button", "aria-label": "No me ayudó", title: "No me ayudó", onclick: (e) => valorar(id, false, e.currentTarget) },
          "👎",
        ),
      ),
    );
  }
  msgs.append(el);
  if (fuentes.length) msgs.append(h("div", { class: "small muted" }, `Fuente: ${fuentes.map((f) => f.titulo).join(" · ")}`));
  if (acciones.length)
    msgs.append(
      h(
        "div",
        { class: "chips" },
        acciones.map((a) => h("button", { class: "chip accion", type: "button", onclick: () => crearCasoDesde(a.datos) }, a.etiqueta)),
      ),
    );
  bajar();
  return el;
}

async function valorar(mensajeId, util, boton) {
  boton.parentElement.querySelectorAll("button").forEach((b) => (b.disabled = true));
  boton.textContent = util ? "👍 ¡Gracias!" : "👎 Gracias";
  try {
    await api(`/api/asistente/conversaciones/${conversacionId}/mensajes/${mensajeId}/util`, { method: "PATCH", body: { util } });
  } catch {
    /* no crítico */
  }
}

async function enviar(texto) {
  texto = (texto ?? "").trim();
  if (!texto || !conversacionId) {
    if (!conversacionId) await abrir();
    if (!conversacionId) return;
    if (!texto) return;
  }
  chips.remove();
  input.value = "";
  burbuja("user", texto);
  const escribiendo = h(
    "div",
    { class: "msg bot", role: "status", "aria-label": "El asistente está escribiendo" },
    h("span", { class: "typing" }, h("i"), h("i"), h("i")),
  );
  msgs.append(escribiendo);
  bajar();
  enviarBtn.disabled = true;
  try {
    const r = await api(`/api/asistente/conversaciones/${conversacionId}/mensajes`, { method: "POST", body: { contenido: texto } });
    escribiendo.remove();
    burbuja("bot", r.mensaje.contenido, { id: r.mensaje.id, acciones: r.acciones, fuentes: r.fuentes });
  } catch (e) {
    escribiendo.remove();
    burbuja(
      "bot",
      e.status === 429
        ? e.message
        : e.sinConexion
          ? "Perdí la conexión. Cuando vuelva el internet puedes reintentar."
          : "Tuve un problema al responder. Puedes intentar de nuevo o crear un caso.",
      { acciones: [{ etiqueta: "Crear un caso", datos: null }] },
    );
  } finally {
    enviarBtn.disabled = false;
    input.focus();
  }
}

/** Lleva al formulario de caso con los datos sugeridos (el usuario revisa y confirma, RF-IA-05). */
function crearCasoDesde(datos) {
  const previos = [...msgs.querySelectorAll(".msg.user")].map((m) => m.textContent).join("\n");
  const prefill = { ...(datos ?? {}), descripcion: datos?.descripcion ?? previos, conversacionId };
  try {
    sessionStorage.setItem("prefillCaso", JSON.stringify(prefill));
  } catch {
    /* noop */
  }
  cerrar();
  location.hash = "#/casos/nuevo";
}
