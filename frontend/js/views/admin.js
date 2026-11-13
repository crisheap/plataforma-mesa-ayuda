import { api, descargar } from "../api.js";
import { h, montar, modal, confirmar, campo, toast, opciones, paginador, vacio, cargando, errorBox, fecha, minutos, ROLES, etiquetaEstado } from "../ui.js";

const ESTADOS_USR = { ACTIVO: ["Activo", "b-verde"], BLOQUEADO: ["Bloqueado", "b-rojo"], INACTIVO: ["Inactivo", "b-gris"] };
const msgs = (e) => [e.message, ...(e.errors ?? []).map((x) => x.message)].join(" · ");

// ───────────── Usuarios (RF-USU-04/05/06) ─────────────
export async function vistaUsuarios({ usuario: yo }) {
  const f = { page: 1, pageSize: 15, q: "", rol: "", estado: "" };
  const lista = h("div", { "aria-live": "polite" });
  const q = h("input", { type: "search", placeholder: "Buscar por nombre o correo", "aria-label": "Buscar usuarios" });
  const sRol = h("select", { "aria-label": "Filtrar por rol" }, opciones(ROLES, "", "Todos los roles"));
  const sEst = h("select", { "aria-label": "Filtrar por estado" }, opciones({ ACTIVO: "Activo", BLOQUEADO: "Bloqueado", INACTIVO: "Inactivo" }, "", "Todos los estados"));

  const cargar = async () => {
    montar(lista, cargando());
    const p = new URLSearchParams({ page: f.page, pageSize: f.pageSize });
    ["q", "rol", "estado"].forEach((k) => f[k] && p.set(k, f[k]));
    try {
      const d = await api(`/api/usuarios?${p}`);
      montar(lista, d.items.length ? h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Nombre completo", "Correo", "Rol", "Estado", "Último acceso", "Acciones"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, d.items.map((u) => h("tr", {},
          h("td", {}, h("strong", {}, u.nombreCompleto), u.debeCambiarPassword ? h("div", { class: "small muted" }, "Debe cambiar contraseña") : null),
          h("td", {}, u.correo), h("td", {}, ROLES[u.rol.nombre]),
          h("td", {}, h("span", { class: `badge ${ESTADOS_USR[u.estado][1]}` }, ESTADOS_USR[u.estado][0])),
          h("td", {}, fecha(u.ultimoAcceso)),
          h("td", {}, h("div", { class: "row" }, ...acciones(u)))))))) : vacio("No hay usuarios con esos filtros."),
        paginador(d.total, d.page, d.pageSize, (n) => { f.page = n; cargar(); }));
    } catch (e) { montar(lista, errorBox(e)); }
  };
  const act = (fn, ok) => async () => { try { await fn(); toast(ok); cargar(); } catch (e) { toast(msgs(e), { ms: 7000 }); } };
  const estado = (u, e) => act(() => api(`/api/usuarios/${u.id}/estado`, { method: "PATCH", body: { estado: e } }), "Estado del usuario actualizado");

  function acciones(u) {
    const yoMismo = u.id === yo.id;
    const b = [h("button", { class: "btn sm", onclick: () => editar(u) }, "Editar")];
    if (u.estado !== "ACTIVO") b.push(h("button", { class: "btn sm", onclick: estado(u, "ACTIVO") }, u.estado === "BLOQUEADO" ? "Desbloquear" : "Reactivar"));
    if (u.estado === "ACTIVO" && !yoMismo) {
      b.push(h("button", { class: "btn sm", onclick: async () => { if (await confirmar("Bloquear cuenta", `${u.nombreCompleto} no podrá ingresar hasta que la desbloquees.`, "Bloquear", true)) estado(u, "BLOQUEADO")(); } }, "Bloquear"));
      b.push(h("button", { class: "btn sm danger", onclick: async () => { if (await confirmar("Dar de baja", `${u.nombreCompleto} quedará inactivo (baja lógica; se conserva su historial).`, "Dar de baja", true)) estado(u, "INACTIVO")(); } }, "Dar de baja"));
    }
    b.push(h("button", { class: "btn sm", onclick: () => restablecer(u) }, "Restablecer contraseña"));
    return b;
  }
  async function restablecer(u) {
    if (!(await confirmar("Restablecer contraseña", `Se generará una contraseña temporal para ${u.nombreCompleto}. Deberá cambiarla al ingresar.`, "Restablecer"))) return;
    try {
      const r = await api(`/api/usuarios/${u.id}/restablecer-password`, { method: "PATCH", body: {} });
      await modal({ titulo: "Contraseña temporal", cuerpo: h("div", {}, h("p", {}, "Entrégala al usuario por un medio seguro. No se volverá a mostrar."), h("p", {}, h("code", { id: "tmp" }, r.passwordTemporal))), acciones: [{ texto: "Copiar", valor: () => { navigator.clipboard?.writeText(r.passwordTemporal); toast("Copiada"); return true; } }, { texto: "Listo", valor: true, primario: true }] });
      cargar();
    } catch (e) { toast(msgs(e), { ms: 7000 }); }
  }
  async function editar(u) {
    const n = h("input", { value: u.nombre, maxlength: "80" }), a = h("input", { value: u.apellido, maxlength: "80" });
    const r = h("select", {}, opciones(ROLES, u.rol.nombre));
    if (u.id === yo.id) r.disabled = true;
    const ok = await modal({ titulo: "Editar usuario", cuerpo: h("div", {}, campo("Nombre", n), campo("Apellido", a), campo("Rol", r, u.id === yo.id ? "No puedes cambiar tu propio rol." : undefined)),
      acciones: [{ texto: "Cancelar", valor: false }, { texto: "Guardar", primario: true, valor: true }] });
    if (!ok) return;
    act(() => api(`/api/usuarios/${u.id}`, { method: "PATCH", body: { nombre: n.value.trim(), apellido: a.value.trim(), ...(u.id === yo.id ? {} : { rol: r.value }) } }), "Usuario actualizado")();
  }
  async function crear() {
    const n = h("input", { maxlength: "80" }), a = h("input", { maxlength: "80" }), c = h("input", { type: "email" }), r = h("select", {}, opciones(ROLES, "USUARIO"));
    const ok = await modal({ titulo: "Nuevo usuario", cuerpo: h("div", {}, campo("Nombre", n), campo("Apellido", a), campo("Correo institucional", c), campo("Rol", r, "Se generará una contraseña temporal que el usuario deberá cambiar.")),
      acciones: [{ texto: "Cancelar", valor: false }, { texto: "Crear usuario", primario: true, valor: true }] });
    if (!ok) return;
    try {
      const res = await api("/api/usuarios", { method: "POST", body: { nombre: n.value.trim(), apellido: a.value.trim(), correo: c.value.trim(), rol: r.value } });
      await modal({ titulo: "Usuario creado", cuerpo: h("div", {}, h("p", {}, `${res.usuario.nombreCompleto} (${res.usuario.correo})`), h("p", {}, "Contraseña temporal (se muestra una sola vez):"), h("p", {}, h("code", {}, res.passwordTemporal))), acciones: [{ texto: "Listo", valor: true, primario: true }] });
      cargar();
    } catch (e) { toast(msgs(e), { ms: 7000 }); }
  }
  let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value.trim(); f.page = 1; cargar(); }, 350); });
  sRol.addEventListener("change", () => { f.rol = sRol.value; f.page = 1; cargar(); });
  sEst.addEventListener("change", () => { f.estado = sEst.value; f.page = 1; cargar(); });
  cargar();
  return h("div", {}, h("div", { class: "page-title" }, h("h1", {}, "Usuarios y técnicos"), h("button", { class: "btn primary", onclick: crear }, "Nuevo usuario")),
    h("div", { class: "card row" }, h("div", { class: "grow" }, q), sRol, sEst), lista);
}

// ───────────── SLA (RF-ADM-01) ─────────────
export async function vistaSla() {
  const d = await api("/api/sla");
  const filas = d.configuraciones.map((c) => ({ ...c, input: h("input", { type: "number", min: "5", max: "43200", value: String(c.tiempoMaximo), "aria-label": `Tiempo máximo prioridad ${c.prioridad}` }), act: h("input", { type: "checkbox", checked: c.activo, "aria-label": `SLA activo ${c.prioridad}` }) }));
  const guardar = async () => {
    try {
      await api("/api/sla", { method: "PUT", body: { configuraciones: filas.map((f) => ({ prioridad: f.prioridad, tiempoMaximo: Number(f.input.value), activo: f.act.checked })) } });
      toast("SLA actualizado. Los casos abiertos se recalcularon.");
    } catch (e) { toast(msgs(e), { ms: 7000 }); }
  };
  const tx = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };
  return h("div", {}, h("div", { class: "page-title" }, h("h1", {}, "Configuración de SLA")),
    h("div", { class: "card stack" }, h("p", { class: "muted" }, "Tiempo máximo de atención (en minutos) contado desde la creación del caso. Al guardar se recalcula el vencimiento de los casos abiertos."),
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Prioridad", "Tiempo máximo (min)", "Equivale a", "Activo"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, filas.map((f) => h("tr", {}, h("td", {}, h("strong", {}, tx[f.prioridad])), h("td", {}, f.input), h("td", {}, minutos(Number(f.input.value))), h("td", {}, f.act)))))),
      h("button", { class: "btn primary", onclick: guardar }, "Guardar cambios")));
}

// ───────────── Reportes y KPIs (RF-ADM-02/03) ─────────────
export async function vistaReportes() {
  const f = { desde: "", hasta: "", prioridad: "", tecnicoId: "" };
  const cont = h("div", { "aria-live": "polite" });
  const desde = h("input", { type: "date", "aria-label": "Desde" }), hasta = h("input", { type: "date", "aria-label": "Hasta" });
  const prio = h("select", { "aria-label": "Prioridad" }, opciones({ ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" }, "", "Todas las prioridades"));
  const tec = h("select", { "aria-label": "Técnico" }, h("option", { value: "" }, "Todos los técnicos"));
  api("/api/usuarios/tecnicos").then((ts) => ts.forEach((t) => tec.append(h("option", { value: t.id }, t.nombreCompleto)))).catch(() => undefined);
  const qs = () => { const p = new URLSearchParams(); if (desde.value) p.set("desde", `${desde.value}T00:00:00`); if (hasta.value) p.set("hasta", `${hasta.value}T23:59:59`); if (prio.value) p.set("prioridad", prio.value); if (tec.value) p.set("tecnicoId", tec.value); return p.toString(); };
  const barra = (n, total) => h("div", { class: "bar", role: "img", "aria-label": `${n} de ${total}` }, h("span", { class: "fill", "data-w": total ? Math.round((n / total) * 100) : 0 }));
  const cargar = async () => {
    montar(cont, cargando());
    try {
      const k = await api(`/api/reportes/kpis?${qs()}`);
      const total = k.totalCasos || 1;
      const bloque = (titulo, obj, etiqueta = (x) => x) => h("section", { class: "card" }, h("h3", {}, titulo), Object.keys(obj).length ? Object.entries(obj).map(([key, n]) => h("div", { class: "stack" }, h("div", { class: "row between" }, h("span", {}, etiqueta(key)), h("strong", {}, String(n))), barra(n, total))) : vacio("Sin datos"));
      montar(cont,
        h("div", { class: "grid cols-4" },
          ...[[k.totalCasos, "Casos totales"], [minutos(k.tiempoMedioResolucionMin), "Tiempo medio de resolución"], [k.cumplimientoSla.porcentaje === null ? "—" : `${k.cumplimientoSla.porcentaje}%`, "Cumplimiento de SLA"], [k.satisfaccion.promedio ?? "—", `Satisfacción (${k.satisfaccion.calificaciones} calif.)`], [k.slaVencidosAbiertos, "SLA vencido (abiertos)"]]
            .map(([n, l]) => h("div", { class: "card kpi" }, h("div", { class: "n" }, String(n)), h("div", { class: "l" }, l)))),
        h("div", { class: "grid cols-2", }, bloque("Casos por estado", k.porEstado, etiquetaEstado), bloque("Casos por prioridad", k.porPrioridad, (x) => ({ ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" })[x])),
        h("section", { class: "card" }, h("h3", {}, "Casos por técnico"), k.porTecnico.length ? h("ul", {}, k.porTecnico.map((t) => h("li", {}, `${t.tecnico}: `, h("strong", {}, String(t.casos))))) : vacio("Sin casos asignados")));
      cont.querySelectorAll(".bar .fill").forEach((el) => { el.style.width = `${el.dataset.w}%`; });
    } catch (e) { montar(cont, errorBox(e)); }
  };
  [desde, hasta, prio, tec].forEach((el) => el.addEventListener("change", cargar));
  cargar();
  return h("div", {}, h("div", { class: "page-title" }, h("h1", {}, "Reportes y KPIs"),
    h("button", { class: "btn primary", onclick: () => descargar(`/api/reportes/casos.xlsx?${qs()}`, "casos.xlsx").then(() => toast("Reporte descargado")).catch((e) => toast(e.message)) }, "Descargar Excel")),
    h("div", { class: "card row" }, h("label", { class: "row" }, "Desde", desde), h("label", { class: "row" }, "Hasta", hasta), prio, tec), cont);
}

// ───────────── Auditoría (RF-ADM-04) ─────────────
export async function vistaAuditoria() {
  const f = { page: 1, pageSize: 25, accion: "", entidad: "" };
  const lista = h("div", { "aria-live": "polite" });
  const accion = h("input", { type: "search", placeholder: "Acción (ej. LOGIN, CASO_CREADO)", "aria-label": "Filtrar por acción" });
  const entidad = h("select", { "aria-label": "Filtrar por entidad" }, opciones({ caso: "Caso", usuario: "Usuario", sla: "SLA", reporte: "Reporte", articulo: "Artículo" }, "", "Todas las entidades"));
  const cargar = async () => {
    montar(lista, cargando());
    const p = new URLSearchParams({ page: f.page, pageSize: f.pageSize }); if (f.accion) p.set("accion", f.accion); if (f.entidad) p.set("entidad", f.entidad);
    try {
      const d = await api(`/api/auditoria?${p}`);
      montar(lista, d.items.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Fecha y hora", "Usuario", "Acción", "Entidad", "Detalle", "IP"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, d.items.map((a) => h("tr", {}, h("td", {}, fecha(a.createdAt)), h("td", {}, a.usuario?.nombreCompleto ?? "—"), h("td", {}, h("code", {}, a.accion)), h("td", {}, `${a.entidad}${a.entidadId ? ` #${a.entidadId}` : ""}`), h("td", {}, a.descripcion ?? (a.datos ? JSON.stringify(a.datos) : "")), h("td", {}, a.ip ?? "—")))))) : vacio("Sin registros."),
        paginador(d.total, d.page, d.pageSize, (n) => { f.page = n; cargar(); }));
    } catch (e) { montar(lista, errorBox(e)); }
  };
  let t; accion.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f.accion = accion.value.trim().toUpperCase(); f.page = 1; cargar(); }, 400); });
  entidad.addEventListener("change", () => { f.entidad = entidad.value; f.page = 1; cargar(); });
  cargar();
  return h("div", {}, h("div", { class: "page-title" }, h("h1", {}, "Bitácora de auditoría")), h("p", { class: "muted" }, "Registro de solo lectura: las entradas no pueden modificarse ni eliminarse."), h("div", { class: "card row" }, h("div", { class: "grow" }, accion), entidad), lista);
}

// ───────────── Base de conocimiento del asistente ─────────────
export async function vistaConocimiento() {
  const lista = h("div", {});
  const cargar = async () => {
    const arts = await api("/api/asistente/conocimiento");
    montar(lista, arts.length ? arts.map((a) => h("section", { class: "card" }, h("div", { class: "row between" }, h("h3", {}, a.titulo), h("span", { class: `badge ${a.activo ? "b-verde" : "b-gris"}` }, a.activo ? "Activo" : "Inactivo")),
      h("p", { class: "small muted" }, `Palabras clave: ${a.palabrasClave.join(", ")}`), h("p", { class: "small", style: null }, a.contenido.slice(0, 220) + (a.contenido.length > 220 ? "…" : "")),
      h("div", { class: "row" }, h("button", { class: "btn sm", onclick: () => editar(a) }, "Editar"), h("button", { class: "btn sm", onclick: async () => { await api(`/api/asistente/conocimiento/${a.id}`, { method: "PATCH", body: { activo: !a.activo } }); cargar(); } }, a.activo ? "Desactivar" : "Activar")))) : vacio("Aún no hay artículos."));
  };
  async function editar(a) {
    const t = h("input", { value: a?.titulo ?? "", maxlength: "150" }), c = h("textarea", {}, a?.contenido ?? ""), k = h("input", { value: a?.palabrasClave.join(", ") ?? "" });
    const ok = await modal({ titulo: a ? "Editar artículo" : "Nuevo artículo", cuerpo: h("div", {}, campo("Título", t), campo("Contenido (pasos)", c), campo("Palabras clave", k, "Separadas por comas.")), acciones: [{ texto: "Cancelar", valor: false }, { texto: "Guardar", primario: true, valor: true }] });
    if (!ok) return;
    const body = { titulo: t.value.trim(), contenido: c.value.trim(), palabrasClave: k.value.split(",").map((x) => x.trim()).filter(Boolean) };
    try { await api(a ? `/api/asistente/conocimiento/${a.id}` : "/api/asistente/conocimiento", { method: a ? "PATCH" : "POST", body }); toast("Artículo guardado"); cargar(); } catch (e) { toast(msgs(e), { ms: 7000 }); }
  }
  await cargar();
  return h("div", {}, h("div", { class: "page-title" }, h("h1", {}, "Base de conocimiento del asistente"), h("button", { class: "btn primary", onclick: () => editar(null) }, "Nuevo artículo")),
    h("p", { class: "muted" }, "Botito responde con base en estos artículos. Mantenlos claros y con pasos numerados."), lista);
}
