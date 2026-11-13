import { api, descargar } from "../api.js";
import { h, montar, modal, confirmar, campo, toast, badgeEstado, badgePrioridad, badgeSla, fecha, minutos, opciones, vacio, TIPOS, CATEGORIAS, ROLES } from "../ui.js";

const tamano = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export async function vistaCasoDetalle({ params, usuario: u }) {
  const id = Number(params.id);
  const raiz = h("div", {});

  async function pintar() {
    const c = await api(`/api/casos/${id}`);
    const esCreador = c.usuarioId === u.id;
    const esTecnico = c.tecnicoId === u.id;
    const staff = ["SUPERVISOR", "ADMINISTRADOR"].includes(u.rol);
    const abierto = ["ABIERTO", "ASIGNADO", "EN_PROCESO"].includes(c.estado);
    const accion = async (fn, ok) => { try { await fn(); if (ok) toast(ok); await pintar(); document.dispatchEvent(new CustomEvent("notificaciones-actualizadas")); } catch (e) { toast(e.message, { ms: 7000 }); } };

    // ── Acciones según rol y estado ──
    const acciones = [];
    if (staff && c.estado !== "CERRADO" && c.estado !== "RESUELTO") acciones.push(panelAsignar(c, accion));
    if (staff && c.estado !== "CERRADO" && c.estado !== "ABIERTO") acciones.push(h("div", {}, h("label", { for: "prio" }, "Cambiar prioridad"), prioridadForm(c, accion)));
    if (esTecnico && c.estado === "ASIGNADO") acciones.push(h("button", { class: "btn primary", onclick: () => accion(() => api(`/api/casos/${id}/estado`, { method: "PATCH", body: { estado: "EN_PROCESO" } }), "Atención iniciada") }, "Iniciar atención"));
    if (esTecnico && c.estado === "EN_PROCESO") acciones.push(h("button", { class: "btn primary", onclick: () => resolver(id, accion) }, "Marcar como resuelto"));
    if (c.estado === "RESUELTO" && (esCreador || staff)) {
      acciones.push(h("div", { class: "alert warn" }, esCreador ? "El técnico propuso una solución. ¿Resolvió tu problema?" : "Caso resuelto, esperando confirmación del usuario."));
      acciones.push(h("button", { class: "btn primary", onclick: async () => { if (await confirmar("Cerrar el caso", esCreador ? "Confirmas que el problema quedó resuelto." : "Cerrarás el caso en nombre del usuario.", "Cerrar caso")) accion(() => api(`/api/casos/${id}/estado`, { method: "PATCH", body: { estado: "CERRADO" } }), "Caso cerrado"); } }, esCreador ? "Sí, se resolvió: cerrar caso" : "Cerrar caso"));
      if (esCreador) acciones.push(h("button", { class: "btn danger", onclick: () => rechazar(id, accion) }, "No se resolvió: rechazar solución"));
    }

    const evidencias = seccionEvidencias(c, id, abierto || c.estado === "RESUELTO", accion);
    const calificacion = seccionCalificacion(c, esCreador, accion);

    montar(raiz,
      h("a", { href: esCreador ? "#/mis-casos" : staff ? "#/casos" : "#/asignados", class: "small" }, "← Volver al listado"),
      h("div", { class: "page-title" }, h("div", {}, h("h1", {}, `${c.numeroCaso} · ${c.titulo}`), h("div", { class: "row" }, badgeEstado(c.estado), badgePrioridad(c.prioridad), badgeSla(c.sla.semaforo),
        c.sla.minutosRestantes !== null ? h("span", { class: "small muted" }, c.sla.minutosRestantes < 0 ? `SLA vencido hace ${minutos(c.sla.minutosRestantes)}` : `Quedan ${minutos(c.sla.minutosRestantes)} de SLA`) : null))),
      h("div", { class: "grid cols-2" },
        h("div", {},
          h("section", { class: "card" }, h("h2", {}, "Descripción"), h("p", { style: null }, c.descripcion),
            h("dl", { class: "small" }, ...dato("Tipo", TIPOS[c.tipo]), ...dato("Categoría", CATEGORIAS[c.categoria]), ...dato("Solicitante", c.usuario?.nombreCompleto), ...dato("Técnico", c.tecnico?.nombreCompleto ?? "Sin asignar"),
              ...dato("Creado", fecha(c.fechaCreacion)), ...dato("Asignado", fecha(c.fechaAsignacion)), ...dato("Resuelto", fecha(c.fechaResolucion)), ...dato("Cerrado", fecha(c.fechaCierre)), ...dato("Vence SLA", fecha(c.slaVenceEn)))),
          evidencias, calificacion),
        h("div", {},
          acciones.length ? h("section", { class: "card stack" }, h("h2", {}, "Acciones"), ...acciones) : null,
          seccionObservaciones(c, id, u, accion),
          h("section", { class: "card" }, h("h2", {}, "Historial"),
            h("ol", { class: "timeline" }, c.historial.map((x) => h("li", {}, h("div", {}, h("strong", {}, x.estadoNuevo.replace("_", " ")), " · ", h("span", { class: "muted small" }, fecha(x.fecha))),
              x.descripcion ? h("div", { class: "small" }, x.descripcion) : null, h("div", { class: "small muted" }, x.usuario?.nombreCompleto))))))));
  }
  await pintar();
  return raiz;
}

const dato = (k, v) => [h("dt", { class: "muted" }, k), h("dd", { style: null }, v ?? "—")];

function panelAsignar(c, accion) {
  const tecnico = h("select", { id: "tec" }, h("option", { value: "" }, "Cargando técnicos…"));
  const prio = h("select", { id: "prio-a" }, opciones({ ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" }, c.prioridad));
  api("/api/usuarios/tecnicos").then((ts) => {
    tecnico.replaceChildren(h("option", { value: "" }, "Selecciona un técnico…"), ...ts.map((t) => h("option", { value: t.id, selected: t.id === c.tecnicoId }, `${t.nombreCompleto} · ${t.casosActivos} activo(s)`)));
  }).catch(() => tecnico.replaceChildren(h("option", { value: "" }, "No se pudo cargar la lista")));
  return h("div", { class: "stack" }, h("h3", {}, c.tecnicoId ? "Reasignar" : "Asignar a un técnico"),
    campo("Técnico disponible", tecnico), campo("Prioridad", prio),
    h("button", { class: "btn primary", onclick: () => {
      if (!tecnico.value) return toast("Selecciona un técnico");
      accion(() => api(`/api/casos/${c.id}/asignar`, { method: "PATCH", body: { tecnicoId: Number(tecnico.value), prioridad: prio.value } }), "Caso asignado");
    } }, c.tecnicoId ? "Reasignar" : "Asignar"));
}
function prioridadForm(c, accion) {
  const s = h("select", { id: "prio" }, opciones({ ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" }, c.prioridad));
  return h("div", { class: "row" }, s, h("button", { class: "btn sm", onclick: () => accion(() => api(`/api/casos/${c.id}/prioridad`, { method: "PATCH", body: { prioridad: s.value } }), "Prioridad actualizada") }, "Guardar"));
}

async function resolver(id, accion) {
  const t = h("textarea", { maxlength: "4000", placeholder: "Describe qué hiciste para resolver el problema…" });
  const v = await modal({ titulo: "Documentar la solución", cuerpo: campo("Solución aplicada", t, "Mínimo 10 caracteres. El usuario la verá para confirmarla."),
    acciones: [{ texto: "Cancelar", valor: null }, { texto: "Marcar como resuelto", primario: true, valor: () => t.value.trim(), validar: () => { if (t.value.trim().length < 10) { toast("Describe la solución (mínimo 10 caracteres)"); return false; } return true; } }] });
  if (v) accion(() => api(`/api/casos/${id}/estado`, { method: "PATCH", body: { estado: "RESUELTO", solucion: v } }), "Caso marcado como resuelto");
}
async function rechazar(id, accion) {
  const t = h("textarea", { maxlength: "1000", placeholder: "¿Qué sigue fallando?" });
  const v = await modal({ titulo: "Rechazar la solución", cuerpo: campo("Motivo", t, "El caso volverá a atención del técnico."),
    acciones: [{ texto: "Cancelar", valor: null }, { texto: "Rechazar solución", peligro: true, valor: () => t.value.trim(), validar: () => { if (t.value.trim().length < 5) { toast("Indica el motivo (mínimo 5 caracteres)"); return false; } return true; } }] });
  if (v) accion(() => api(`/api/casos/${id}/estado`, { method: "PATCH", body: { estado: "EN_PROCESO", motivo: v } }), "Solución rechazada");
}

function seccionEvidencias(c, id, puedeAdjuntar, accion) {
  const input = h("input", { type: "file", multiple: true, accept: ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.log,.docx,.xlsx,.mp4,.webm", "aria-label": "Adjuntar evidencias" });
  const subir = h("button", { class: "btn sm", onclick: () => {
    if (!input.files.length) return toast("Selecciona al menos un archivo");
    const fd = new FormData(); [...input.files].forEach((f) => fd.append("archivos", f));
    accion(() => api(`/api/casos/${id}/evidencias`, { method: "POST", form: fd }), "Evidencias adjuntadas");
  } }, "Adjuntar");
  return h("section", { class: "card" }, h("h2", {}, `Evidencias (${c.evidencias.length})`),
    c.evidencias.length ? h("ul", {}, c.evidencias.map((e) => h("li", {}, h("button", { class: "btn sm", onclick: () => descargar(`/api/casos/${id}/evidencias/${e.id}/descargar`, e.nombreArchivo).catch((er) => toast(er.message)) }, "Descargar"), " ", e.nombreArchivo, h("span", { class: "muted small" }, ` · ${tamano(e.tamano)}`)))) : vacio("Sin evidencias."),
    puedeAdjuntar && c.estado !== "CERRADO" ? h("div", { class: "row" }, input, subir) : null);
}

function seccionObservaciones(c, id, u, accion) {
  const personal = u.rol !== "USUARIO";
  const texto = h("textarea", { maxlength: "2000", "aria-label": "Nuevo comentario", placeholder: "Escribe un comentario…" });
  const interna = h("input", { type: "checkbox", id: "interna" });
  return h("section", { class: "card" }, h("h2", {}, "Comentarios"),
    c.observaciones.length ? c.observaciones.map((o) => h("div", { class: `note ${o.visibilidad === "INTERNA" ? "interna" : ""}` },
      h("header", {}, `${o.usuario.nombreCompleto} (${ROLES[o.usuario.rol]}) · ${fecha(o.createdAt)}`, o.visibilidad === "INTERNA" ? " · Nota interna" : ""), h("div", { style: null }, o.contenido))) : vacio("Aún no hay comentarios."),
    c.estado === "CERRADO" ? h("p", { class: "muted small" }, "El caso está cerrado y no admite más comentarios.") : h("div", { class: "stack" }, texto,
      personal ? h("label", { class: "row", for: "interna", style: null }, interna, "Nota interna (no visible para el solicitante)") : null,
      h("button", { class: "btn primary sm", onclick: () => {
        if (texto.value.trim().length < 2) return toast("Escribe un comentario");
        accion(() => api(`/api/casos/${id}/observaciones`, { method: "POST", body: { contenido: texto.value.trim(), visibilidad: interna.checked ? "INTERNA" : "PUBLICA" } }), "Comentario agregado");
      } }, "Comentar")));
}

function seccionCalificacion(c, esCreador, accion) {
  if (c.calificacion) return h("section", { class: "card" }, h("h2", {}, "Calificación"), h("p", {}, "★".repeat(c.calificacion.puntuacion) + "☆".repeat(5 - c.calificacion.puntuacion), ` (${c.calificacion.puntuacion}/5)`), c.calificacion.comentario ? h("p", { class: "muted" }, c.calificacion.comentario) : null);
  if (!esCreador || !["RESUELTO", "CERRADO"].includes(c.estado)) return null;
  let valor = 0;
  const estrellas = [1, 2, 3, 4, 5].map((n) => h("button", { type: "button", "aria-label": `${n} estrella${n > 1 ? "s" : ""}`, "aria-pressed": "false", onclick: () => { valor = n; estrellas.forEach((b, i) => { b.classList.toggle("on", i < n); b.setAttribute("aria-pressed", String(i + 1 === n)); }); } }, "★"));
  const com = h("textarea", { maxlength: "1000", placeholder: "Comentario (opcional)", "aria-label": "Comentario de la calificación" });
  return h("section", { class: "card stack" }, h("h2", {}, "Califica la atención"), h("div", { class: "stars", role: "group", "aria-label": "Calificación de 1 a 5 estrellas" }, estrellas), com,
    h("button", { class: "btn primary", onclick: () => { if (!valor) return toast("Elige de 1 a 5 estrellas"); accion(() => api(`/api/casos/${c.id}/calificacion`, { method: "POST", body: { puntuacion: valor, comentario: com.value.trim() || undefined } }), "¡Gracias por tu calificación!"); } }, "Enviar calificación"));
}
