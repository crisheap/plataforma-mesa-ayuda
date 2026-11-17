import { api } from "../api.js";
import { etiquetaCentro, selectorCentro } from "../centros-ui.js";
import {
  envolturaTabla,
  h,
  montar,
  modal,
  confirmar,
  campo,
  toast,
  opciones,
  paginador,
  vacio,
  cargando,
  errorBox,
  fecha,
  minutos,
  ROLES,
} from "../ui.js";

const ESTADOS_USR = { ACTIVO: ["Activo", "b-verde"], BLOQUEADO: ["Bloqueado", "b-rojo"], INACTIVO: ["Inactivo", "b-gris"] };
const TIPOS_CORREO = { EMPRESARIAL: "Empresarial", PERSONAL: "Personal" };

/** Misma regla del servidor (RF-USU-09): empresarial si el dominio o un subdominio está en la lista. */
const tipoDeCorreo = (correo, dominios) => {
  const d = (correo.split("@")[1] ?? "").trim().toLowerCase();
  return dominios.some((e) => d === e || d.endsWith(`.${e}`)) ? "EMPRESARIAL" : "PERSONAL";
};

/** Resultado del envío del enlace de acceso (RF-USU-10). */
async function mostrarAcceso(u, a) {
  const enlace = a.enlace;
  await modal({
    titulo: a.enviado ? "Correo de acceso enviado" : "No se pudo enviar el correo",
    cuerpo: h(
      "div",
      {},
      a.enviado
        ? h("p", {}, `Se envió a `, h("strong", {}, a.enviadoA), ` el enlace para que ${u.nombreCompleto} cree su contraseña.`)
        : h("div", { class: "alert", role: "alert" }, a.error ?? "Revisa la configuración del correo saliente."),
      h(
        "p",
        { class: "small muted" },
        `El enlace sirve una sola vez y vence el ${fecha(a.expiraEn)}. Los enlaces anteriores dejan de funcionar.`,
      ),
      enlace
        ? [
            h("p", {}, "El servidor no tiene correo saliente configurado (SMTP). Entrega este enlace a la persona por un medio seguro:"),
            h("p", {}, h("code", { class: "romper" }, enlace)),
          ]
        : null,
    ),
    acciones: [
      ...(enlace
        ? [
            {
              texto: "Copiar enlace",
              valor: () => {
                navigator.clipboard?.writeText(enlace);
                toast("Enlace copiado");
                return true;
              },
            },
          ]
        : []),
      { texto: "Listo", valor: true, primario: true },
    ],
  });
}

/** Campos de correo de una cuenta: tipo y correo personal (este solo aplica si el de acceso es empresarial). */
function camposCorreo({ correoAcceso, tipoInicial, personalInicial, dominios }) {
  const tipo = h("select", {}, opciones(TIPOS_CORREO, tipoInicial));
  const personal = h("input", {
    type: "email",
    autocomplete: "off",
    maxlength: "150",
    placeholder: "nombre@gmail.com",
    value: personalInicial ?? "",
  });
  const bloquePersonal = campo(
    "Correo personal (opcional)",
    personal,
    "Recibe la bienvenida y los enlaces para crear o restablecer la contraseña. Las notificaciones de los casos llegan al correo de acceso.",
  );
  let tocado = false;
  const pintar = () => {
    if (!tocado && correoAcceso?.value.includes("@")) tipo.value = tipoDeCorreo(correoAcceso.value, dominios());
    bloquePersonal.classList.toggle("campo-oculto", tipo.value === "PERSONAL");
  };
  tipo.addEventListener("change", () => {
    tocado = true;
    pintar();
  });
  correoAcceso?.addEventListener("input", pintar);
  pintar();
  return {
    nodos: [campo("Tipo de correo de acceso", tipo, "Se deduce del dominio (ver Configuración); puedes cambiarlo."), bloquePersonal],
    valores: () => ({ tipoCorreo: tipo.value, correoPersonal: tipo.value === "EMPRESARIAL" ? personal.value.trim() : "" }),
  };
}
const msgs = (e) => [e.message, ...(e.errors ?? []).map((x) => x.message)].join(" · ");

// ───────────── Usuarios (RF-USU-04/05/06) ─────────────
export async function vistaUsuarios({ usuario: yo }) {
  // Parámetros del enlace (desde Centros): ?centro=ID filtra; ?nuevo=ADMINISTRADOR abre la creación (RF-CEN-03).
  const qs = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const general = yo.esGeneral;
  const f = { page: 1, pageSize: 15, q: "", rol: "", estado: "", tipoCorreo: "", centroId: general ? (qs.get("centro") ?? "") : "" };
  /** Roles que puedo asignar: el administrador de centro no crea administradores. */
  const rolesPermitidos = general ? ROLES : Object.fromEntries(Object.entries(ROLES).filter(([k]) => k !== "ADMINISTRADOR"));
  /** Misma regla del servidor (puedeGestionar): el general gestiona todo; el de centro, lo no administrador de su centro. */
  const gestionable = (u) =>
    u.id === yo.id || (general ? u.centro !== null : u.centro?.id === yo.centro?.id && u.rol.nombre !== "ADMINISTRADOR");
  const sCentro = general ? selectorCentro({ valor: f.centroId }) : null;
  let cfg = { dominiosEmpresariales: [], smtpConfigurado: true, vigenciaEnlaceHoras: 48 };
  api("/api/configuracion/correo")
    .then((d) => {
      cfg = d;
    })
    .catch(() => undefined);
  const sTipo = h("select", { "aria-label": "Filtrar por tipo de correo" }, opciones(TIPOS_CORREO, "", "Todos los correos"));
  const lista = h("div", { "aria-live": "polite" });
  const q = h("input", { type: "search", placeholder: "Buscar por nombre o correo", "aria-label": "Buscar usuarios" });
  const sRol = h("select", { "aria-label": "Filtrar por rol" }, opciones(ROLES, "", "Todos los roles"));
  const sEst = h(
    "select",
    { "aria-label": "Filtrar por estado" },
    opciones({ ACTIVO: "Activo", BLOQUEADO: "Bloqueado", INACTIVO: "Inactivo" }, "", "Todos los estados"),
  );

  const cargar = async () => {
    montar(lista, cargando());
    const p = new URLSearchParams({ page: f.page, pageSize: f.pageSize });
    ["q", "rol", "estado", "tipoCorreo", "centroId"].forEach((k) => {
      f[k] && p.set(k, f[k]);
    });
    try {
      const d = await api(`/api/usuarios?${p}`);
      montar(
        lista,
        d.items.length
          ? h(
              "div",
              envolturaTabla("Usuarios"),
              h(
                "table",
                {},
                h(
                  "thead",
                  {},
                  h(
                    "tr",
                    {},
                    ["Nombre completo", "Correo", "Rol", ...(general ? ["Centro"] : []), "Estado", "Último acceso", "Acciones"].map((t) =>
                      h("th", { scope: "col" }, t),
                    ),
                  ),
                ),
                h(
                  "tbody",
                  {},
                  d.items.map((u) =>
                    h(
                      "tr",
                      {},
                      h(
                        "td",
                        {},
                        h("strong", {}, u.nombreCompleto),
                        u.debeCambiarPassword ? h("div", { class: "small muted" }, "Debe cambiar contraseña") : null,
                      ),
                      h(
                        "td",
                        {},
                        u.correo,
                        " ",
                        h("span", { class: `badge ${u.tipoCorreo === "PERSONAL" ? "b-gris" : "b-azul"}` }, TIPOS_CORREO[u.tipoCorreo]),
                        u.correoPersonal ? h("div", { class: "small muted" }, `Personal: ${u.correoPersonal}`) : null,
                      ),
                      h("td", {}, u.rol.nombre === "ADMINISTRADOR" && !u.centro ? "Administrador general" : ROLES[u.rol.nombre]),
                      general ? h("td", {}, etiquetaCentro(u.centro)) : null,
                      h("td", {}, h("span", { class: `badge ${ESTADOS_USR[u.estado][1]}` }, ESTADOS_USR[u.estado][0])),
                      h("td", {}, fecha(u.ultimoAcceso)),
                      h(
                        "td",
                        {},
                        gestionable(u)
                          ? h("div", { class: "row" }, ...acciones(u))
                          : h("span", { class: "small muted" }, "Lo gestiona el administrador general"),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : vacio("No hay usuarios con esos filtros."),
        paginador(d.total, d.page, d.pageSize, (n) => {
          f.page = n;
          cargar();
        }),
      );
    } catch (e) {
      montar(lista, errorBox(e));
    }
  };
  const act = (fn, ok) => async () => {
    try {
      await fn();
      toast(ok);
      cargar();
    } catch (e) {
      toast(msgs(e), { ms: 7000 });
    }
  };
  const estado = (u, e) =>
    act(() => api(`/api/usuarios/${u.id}/estado`, { method: "PATCH", body: { estado: e } }), "Estado del usuario actualizado");

  function acciones(u) {
    const yoMismo = u.id === yo.id;
    const b = [h("button", { class: "btn sm", onclick: () => editar(u) }, "Editar")];
    if (u.estado !== "ACTIVO")
      b.push(h("button", { class: "btn sm", onclick: estado(u, "ACTIVO") }, u.estado === "BLOQUEADO" ? "Desbloquear" : "Reactivar"));
    if (u.estado === "ACTIVO" && !yoMismo) {
      b.push(
        h(
          "button",
          {
            class: "btn sm",
            onclick: async () => {
              if (await confirmar("Bloquear cuenta", `${u.nombreCompleto} no podrá ingresar hasta que la desbloquees.`, "Bloquear", true))
                estado(u, "BLOQUEADO")();
            },
          },
          "Bloquear",
        ),
      );
      b.push(
        h(
          "button",
          {
            class: "btn sm danger",
            onclick: async () => {
              if (
                await confirmar(
                  "Dar de baja",
                  `${u.nombreCompleto} quedará inactivo (baja lógica; se conserva su historial).`,
                  "Dar de baja",
                  true,
                )
              )
                estado(u, "INACTIVO")();
            },
          },
          "Dar de baja",
        ),
      );
    }
    if (u.estado === "ACTIVO") b.push(h("button", { class: "btn sm", onclick: () => enviarAcceso(u) }, "Enviar acceso"));
    b.push(h("button", { class: "btn sm", onclick: () => restablecer(u) }, "Contraseña temporal"));
    return b;
  }
  async function enviarAcceso(u) {
    const destino = u.correoPersonal ?? u.correo;
    if (
      !(await confirmar(
        "Enviar enlace de acceso",
        `Se enviará a ${destino} un enlace para que ${u.nombreCompleto} cree o restablezca su contraseña. Vence en ${cfg.vigenciaEnlaceHoras} horas y anula los enlaces anteriores.`,
        "Enviar",
      ))
    )
      return;
    try {
      await mostrarAcceso(u, await api(`/api/usuarios/${u.id}/enviar-acceso`, { method: "POST", body: {} }));
      cargar();
    } catch (e) {
      toast(msgs(e), { ms: 7000 });
    }
  }
  async function restablecer(u) {
    if (
      !(await confirmar(
        "Restablecer contraseña",
        `Se generará una contraseña temporal para ${u.nombreCompleto} que verás en pantalla y deberás entregarle; deberá cambiarla al ingresar. Si prefieres que la persona cree su contraseña desde su correo, usa «Enviar acceso».`,
        "Restablecer",
      ))
    )
      return;
    try {
      const r = await api(`/api/usuarios/${u.id}/restablecer-password`, { method: "PATCH", body: {} });
      await modal({
        titulo: "Contraseña temporal",
        cuerpo: h(
          "div",
          {},
          h("p", {}, "Entrégala al usuario por un medio seguro. No se volverá a mostrar."),
          h("p", {}, h("code", { id: "tmp" }, r.passwordTemporal)),
        ),
        acciones: [
          {
            texto: "Copiar",
            valor: () => {
              navigator.clipboard?.writeText(r.passwordTemporal);
              toast("Copiada");
              return true;
            },
          },
          { texto: "Listo", valor: true, primario: true },
        ],
      });
      cargar();
    } catch (e) {
      toast(msgs(e), { ms: 7000 });
    }
  }
  async function editar(u) {
    const n = h("input", { value: u.nombre, maxlength: "80" }),
      a = h("input", { value: u.apellido, maxlength: "80" });
    const r = h("select", {}, opciones(u.id === yo.id ? ROLES : rolesPermitidos, u.rol.nombre));
    if (u.id === yo.id) r.disabled = true;
    const cen = general && u.centro ? selectorCentro({ todos: null, etiqueta: "Centro", valor: u.centro.id, soloActivos: true }) : null;
    const correos = camposCorreo({
      tipoInicial: u.tipoCorreo,
      personalInicial: u.correoPersonal,
      dominios: () => cfg.dominiosEmpresariales,
    });
    const ok = await modal({
      titulo: "Editar usuario",
      cuerpo: h(
        "div",
        {},
        campo("Nombre", n),
        campo("Apellido", a),
        campo("Rol", r, u.id === yo.id ? "No puedes cambiar tu propio rol." : undefined),
        cen ? campo("Centro", cen, "Para cambiar a alguien de centro no debe tener casos asignados sin terminar.") : null,
        h("p", { class: "small" }, "Correo de acceso: ", h("strong", {}, u.correo)),
        correos.nodos,
      ),
      acciones: [
        { texto: "Cancelar", valor: false },
        { texto: "Guardar", primario: true, valor: true },
      ],
    });
    if (!ok) return;
    act(
      () =>
        api(`/api/usuarios/${u.id}`, {
          method: "PATCH",
          body: {
            nombre: n.value.trim(),
            apellido: a.value.trim(),
            ...(u.id === yo.id ? {} : { rol: r.value }),
            ...(cen?.value ? { centroId: Number(cen.value) } : {}),
            ...correos.valores(),
          },
        }),
      "Usuario actualizado",
    )();
  }
  async function crear({ rol = "USUARIO", centro = f.centroId } = {}) {
    const n = h("input", { maxlength: "80" }),
      a = h("input", { maxlength: "80" }),
      c = h("input", { type: "email", autocomplete: "off", maxlength: "150" }),
      r = h("select", {}, opciones(rolesPermitidos, rolesPermitidos[rol] ? rol : "USUARIO"));
    const cen = general ? selectorCentro({ todos: null, etiqueta: "Centro", valor: centro, soloActivos: true }) : null;
    const correos = camposCorreo({ correoAcceso: c, tipoInicial: "EMPRESARIAL", dominios: () => cfg.dominiosEmpresariales });
    const enviar = h("input", { type: "checkbox", id: "enviar-acceso", checked: true });
    const ok = await modal({
      titulo: "Nuevo usuario",
      cuerpo: h(
        "div",
        {},
        campo("Nombre", n),
        campo("Apellido", a),
        campo("Correo de acceso", c, "Con este correo iniciará sesión y recibirá las notificaciones de sus casos."),
        correos.nodos,
        campo("Rol", r, general ? "Elige «Administrador» para crear el administrador de un centro." : undefined),
        cen
          ? campo("Centro", cen, "La persona solo verá y gestionará la información de este centro.")
          : h("p", { class: "small muted" }, `La cuenta se creará en tu centro (${yo.centro?.codigo ?? ""}).`),
        h("label", { class: "row", for: "enviar-acceso" }, enviar, "Enviar correo de bienvenida con un enlace para crear la contraseña"),
        h(
          "p",
          { class: "small muted" },
          cfg.smtpConfigurado
            ? `El enlace vence en ${cfg.vigenciaEnlaceHoras} horas. Si desmarcas la opción, verás una contraseña temporal para entregarla tú.`
            : "El servidor aún no tiene correo saliente configurado (SMTP): verás el enlace en pantalla para entregarlo a la persona.",
        ),
      ),
      acciones: [
        { texto: "Cancelar", valor: false },
        {
          texto: "Crear usuario",
          primario: true,
          valor: true,
          validar: () => {
            if (cen && !cen.value) {
              toast("Elige el centro de la cuenta");
              return false;
            }
            return true;
          },
        },
      ],
    });
    if (!ok) return;
    try {
      const res = await api("/api/usuarios", {
        method: "POST",
        body: {
          nombre: n.value.trim(),
          apellido: a.value.trim(),
          correo: c.value.trim(),
          rol: r.value,
          ...(cen ? { centroId: Number(cen.value) } : {}),
          ...correos.valores(),
          enviarAcceso: enviar.checked,
        },
      });
      if (res.acceso) {
        await mostrarAcceso(res.usuario, res.acceso);
        cargar();
        return;
      }
      await modal({
        titulo: "Usuario creado",
        cuerpo: h(
          "div",
          {},
          h("p", {}, `${res.usuario.nombreCompleto} (${res.usuario.correo})`),
          h("p", {}, "Contraseña temporal (se muestra una sola vez):"),
          h("p", {}, h("code", {}, res.passwordTemporal)),
        ),
        acciones: [{ texto: "Listo", valor: true, primario: true }],
      });
      cargar();
    } catch (e) {
      toast(msgs(e), { ms: 7000 });
    }
  }
  let t;
  q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      f.q = q.value.trim();
      f.page = 1;
      cargar();
    }, 350);
  });
  sRol.addEventListener("change", () => {
    f.rol = sRol.value;
    f.page = 1;
    cargar();
  });
  sEst.addEventListener("change", () => {
    f.estado = sEst.value;
    f.page = 1;
    cargar();
  });
  sTipo.addEventListener("change", () => {
    f.tipoCorreo = sTipo.value;
    f.page = 1;
    cargar();
  });
  sCentro?.addEventListener("change", () => {
    f.centroId = sCentro.value;
    f.page = 1;
    cargar();
  });
  cargar();
  if (qs.get("nuevo")) {
    // Se limpia el parámetro para que recargar la página no vuelva a abrir el formulario.
    history.replaceState(null, "", f.centroId ? `#/usuarios?centro=${f.centroId}` : "#/usuarios");
    setTimeout(() => crear({ rol: qs.get("nuevo"), centro: qs.get("centro") ?? "" }), 0);
  }
  return h(
    "div",
    {},
    h(
      "div",
      { class: "page-title" },
      h("h1", {}, general ? "Usuarios de todos los centros" : `Usuarios del centro ${yo.centro?.codigo ?? ""}`),
      h("button", { class: "btn primary", onclick: crear }, "Nuevo usuario"),
    ),
    h("div", { class: "card row" }, h("div", { class: "grow" }, q), sCentro, sRol, sEst, sTipo),
    lista,
  );
}

// ───────────── Configuración: correo (RF-ADM-05) ─────────────
export async function vistaConfiguracion() {
  const d = await api("/api/configuracion/correo");
  const area = h(
    "textarea",
    { rows: "5", spellcheck: "false", placeholder: "sena.edu.co\nmisena.edu.co" },
    d.dominiosEmpresariales.join("\n"),
  );
  const reclasificar = h("input", { type: "checkbox", id: "reclasificar" });
  const guardar = h(
    "button",
    {
      class: "btn primary",
      type: "button",
      onclick: async () => {
        const dominios = area.value.split(/[\s,;]+/).filter(Boolean);
        guardar.disabled = true;
        try {
          const r = await api("/api/configuracion/correo", {
            method: "PUT",
            body: { dominiosEmpresariales: dominios, reclasificar: reclasificar.checked },
          });
          area.value = r.dominios.join("\n");
          reclasificar.checked = false;
          toast(r.reclasificados ? `Configuración guardada: ${r.reclasificados} cuenta(s) cambiaron de tipo` : "Configuración guardada");
        } catch (e) {
          toast(msgs(e), { ms: 7000 });
        } finally {
          guardar.disabled = false;
        }
      },
    },
    "Guardar",
  );
  return h(
    "div",
    {},
    h("div", { class: "page-title" }, h("h1", {}, "Configuración")),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Dominios de correo empresariales"),
      h(
        "p",
        { class: "muted" },
        "Las cuentas cuyo correo de acceso termine en uno de estos dominios se marcan como empresariales y pueden tener además un correo personal. Las demás (Gmail, Hotmail, Outlook…) se marcan como personales. Puedes cambiar el tipo de cada usuario al editarlo.",
      ),
      campo("Un dominio por línea", area, `Proveedores personales comunes: ${d.proveedoresPersonales.join(", ")}.`),
      h("label", { class: "row", for: "reclasificar" }, reclasificar, "Actualizar también el tipo de correo de las cuentas existentes"),
      h("div", { class: "row" }, guardar),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Correos de bienvenida y acceso"),
      h(
        "dl",
        { class: "small" },
        h("dt", { class: "muted" }, "Correo saliente (SMTP)"),
        h(
          "dd",
          {},
          d.smtpConfigurado
            ? h("span", { class: "badge b-verde" }, "Configurado")
            : [
                h("span", { class: "badge b-ambar" }, "Sin configurar"),
                " Los correos se escriben en la consola del servidor y el enlace se muestra al administrador.",
              ],
        ),
        h("dt", { class: "muted" }, "Dirección de la plataforma en los enlaces"),
        h("dd", {}, h("code", {}, d.appUrl)),
        h("dt", { class: "muted" }, "Vigencia de los enlaces"),
        h("dd", {}, `${d.vigenciaEnlaceHoras} horas, un solo uso`),
      ),
      h(
        "p",
        { class: "small muted" },
        "Estos valores se cambian en el archivo .env del servidor: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL y ACCESO_VIGENCIA_HORAS.",
      ),
    ),
  );
}

// ───────────── SLA (RF-ADM-01) ─────────────
export async function vistaSla() {
  const d = await api("/api/sla");
  const filas = d.configuraciones.map((c) => ({
    ...c,
    input: h("input", {
      type: "number",
      min: "5",
      max: "43200",
      value: String(c.tiempoMaximo),
      "aria-label": `Tiempo máximo prioridad ${c.prioridad}`,
    }),
    act: h("input", { type: "checkbox", checked: c.activo, "aria-label": `SLA activo ${c.prioridad}` }),
  }));
  const guardar = async () => {
    try {
      await api("/api/sla", {
        method: "PUT",
        body: {
          configuraciones: filas.map((f) => ({ prioridad: f.prioridad, tiempoMaximo: Number(f.input.value), activo: f.act.checked })),
        },
      });
      toast("SLA actualizado. Los casos abiertos se recalcularon.");
    } catch (e) {
      toast(msgs(e), { ms: 7000 });
    }
  };
  const tx = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };
  return h(
    "div",
    {},
    h("div", { class: "page-title" }, h("h1", {}, "Configuración de SLA")),
    h(
      "div",
      { class: "card stack" },
      h(
        "p",
        { class: "muted" },
        "Tiempo máximo de atención (en minutos) contado desde la creación del caso. Al guardar se recalcula el vencimiento de los casos abiertos.",
      ),
      h(
        "div",
        envolturaTabla("Tiempos de SLA por prioridad"),
        h(
          "table",
          {},
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              ["Prioridad", "Tiempo máximo (min)", "Equivale a", "Activo"].map((t) => h("th", { scope: "col" }, t)),
            ),
          ),
          h(
            "tbody",
            {},
            filas.map((f) =>
              h(
                "tr",
                {},
                h("td", {}, h("strong", {}, tx[f.prioridad])),
                h("td", {}, f.input),
                h("td", {}, minutos(Number(f.input.value))),
                h("td", {}, f.act),
              ),
            ),
          ),
        ),
      ),
      h("button", { class: "btn primary", onclick: guardar }, "Guardar cambios"),
    ),
  );
}

// ───────────── Auditoría (RF-ADM-04) ─────────────
export async function vistaAuditoria({ usuario: yo }) {
  const f = { page: 1, pageSize: 25, accion: "", entidad: "", centroId: "" };
  // El general puede ver un centro o todos; los demás ven siempre las acciones de su centro (RF-CEN-02).
  const sCentro = yo.esGeneral ? selectorCentro() : null;
  const lista = h("div", { "aria-live": "polite" });
  const accion = h("input", { type: "search", placeholder: "Acción (ej. LOGIN, CASO_CREADO)", "aria-label": "Filtrar por acción" });
  const entidad = h(
    "select",
    { "aria-label": "Filtrar por entidad" },
    opciones(
      { caso: "Caso", usuario: "Usuario", centro: "Centro", sla: "SLA", reporte: "Reporte", articulo: "Artículo" },
      "",
      "Todas las entidades",
    ),
  );
  const cargar = async () => {
    montar(lista, cargando());
    const p = new URLSearchParams({ page: f.page, pageSize: f.pageSize });
    if (f.accion) p.set("accion", f.accion);
    if (f.entidad) p.set("entidad", f.entidad);
    if (f.centroId) p.set("centroId", f.centroId);
    try {
      const d = await api(`/api/auditoria?${p}`);
      montar(
        lista,
        d.items.length
          ? h(
              "div",
              envolturaTabla("Bitácora de auditoría"),
              h(
                "table",
                {},
                h(
                  "thead",
                  {},
                  h(
                    "tr",
                    {},
                    ["Fecha y hora", "Usuario", "Acción", "Entidad", "Detalle", "IP"].map((t) => h("th", { scope: "col" }, t)),
                  ),
                ),
                h(
                  "tbody",
                  {},
                  d.items.map((a) =>
                    h(
                      "tr",
                      {},
                      h("td", {}, fecha(a.createdAt)),
                      h("td", {}, a.usuario?.nombreCompleto ?? "—"),
                      h("td", {}, h("code", {}, a.accion)),
                      h("td", {}, `${a.entidad}${a.entidadId ? ` #${a.entidadId}` : ""}`),
                      h("td", {}, a.descripcion ?? (a.datos ? JSON.stringify(a.datos) : "")),
                      h("td", {}, a.ip ?? "—"),
                    ),
                  ),
                ),
              ),
            )
          : vacio("Sin registros."),
        paginador(d.total, d.page, d.pageSize, (n) => {
          f.page = n;
          cargar();
        }),
      );
    } catch (e) {
      montar(lista, errorBox(e));
    }
  };
  let t;
  accion.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      f.accion = accion.value.trim().toUpperCase();
      f.page = 1;
      cargar();
    }, 400);
  });
  sCentro?.addEventListener("change", () => {
    f.centroId = sCentro.value;
    f.page = 1;
    cargar();
  });
  entidad.addEventListener("change", () => {
    f.entidad = entidad.value;
    f.page = 1;
    cargar();
  });
  cargar();
  return h(
    "div",
    {},
    h("div", { class: "page-title" }, h("h1", {}, "Bitácora de auditoría")),
    h("p", { class: "muted" }, "Registro de solo lectura: las entradas no pueden modificarse ni eliminarse."),
    h("div", { class: "card row" }, h("div", { class: "grow" }, accion), sCentro, entidad),
    lista,
  );
}

// ───────────── Base de conocimiento del asistente ─────────────
export async function vistaConocimiento() {
  const lista = h("div", {});
  const cargar = async () => {
    const arts = await api("/api/asistente/conocimiento");
    montar(
      lista,
      arts.length
        ? arts.map((a) =>
            h(
              "section",
              { class: "card" },
              h(
                "div",
                { class: "row between" },
                h("h3", {}, a.titulo),
                h("span", { class: `badge ${a.activo ? "b-verde" : "b-gris"}` }, a.activo ? "Activo" : "Inactivo"),
              ),
              h("p", { class: "small muted" }, `Palabras clave: ${a.palabrasClave.join(", ")}`),
              h("p", { class: "small", style: null }, a.contenido.slice(0, 220) + (a.contenido.length > 220 ? "…" : "")),
              h(
                "div",
                { class: "row" },
                h("button", { class: "btn sm", onclick: () => editar(a) }, "Editar"),
                h(
                  "button",
                  {
                    class: "btn sm",
                    onclick: async () => {
                      await api(`/api/asistente/conocimiento/${a.id}`, { method: "PATCH", body: { activo: !a.activo } });
                      cargar();
                    },
                  },
                  a.activo ? "Desactivar" : "Activar",
                ),
              ),
            ),
          )
        : vacio("Aún no hay artículos."),
    );
  };
  async function editar(a) {
    const t = h("input", { value: a?.titulo ?? "", maxlength: "150" }),
      c = h("textarea", {}, a?.contenido ?? ""),
      k = h("input", { value: a?.palabrasClave.join(", ") ?? "" });
    const ok = await modal({
      titulo: a ? "Editar artículo" : "Nuevo artículo",
      cuerpo: h("div", {}, campo("Título", t), campo("Contenido (pasos)", c), campo("Palabras clave", k, "Separadas por comas.")),
      acciones: [
        { texto: "Cancelar", valor: false },
        { texto: "Guardar", primario: true, valor: true },
      ],
    });
    if (!ok) return;
    const body = {
      titulo: t.value.trim(),
      contenido: c.value.trim(),
      palabrasClave: k.value
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };
    try {
      await api(a ? `/api/asistente/conocimiento/${a.id}` : "/api/asistente/conocimiento", { method: a ? "PATCH" : "POST", body });
      toast("Artículo guardado");
      cargar();
    } catch (e) {
      toast(msgs(e), { ms: 7000 });
    }
  }
  await cargar();
  return h(
    "div",
    {},
    h(
      "div",
      { class: "page-title" },
      h("h1", {}, "Base de conocimiento del asistente"),
      h("button", { class: "btn primary", onclick: () => editar(null) }, "Nuevo artículo"),
    ),
    h("p", { class: "muted" }, "Botito responde con base en estos artículos. Mantenlos claros y con pasos numerados."),
    lista,
  );
}
