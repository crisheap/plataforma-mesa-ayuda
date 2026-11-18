/**
 * Panel de seguridad (RF-SEG-02 a RF-SEG-05) — solo administradores.
 * Muestra los intentos de acceso fallidos, ataques detectados y entradas sospechosas,
 * el estado de integridad del código y las acciones de emergencia: cerrar todas las sesiones
 * (administrador general o de centro) y el bloqueo de emergencia (solo el administrador general).
 * El administrador de centro ve únicamente lo que ocurre en su centro.
 */
import { api, reemplazarSesion } from "../api.js";
import { h, montar, opciones, toast, vacio, cargando, errorBox, fecha, paginador, confirmar, campo, envolturaTabla } from "../ui.js";
import { num } from "../graficas.js";
import { selectorCentro } from "../centros-ui.js";

const SEVERIDAD = {
  CRITICA: ["Crítica", "b-rojo", "⛔"],
  ADVERTENCIA: ["Advertencia", "b-ambar", "⚠"],
  INFO: ["Informativa", "b-gris", "ℹ"],
};
const TIPOS = {
  LOGIN_FALLIDO: "Inicio de sesión fallido",
  CUENTA_BLOQUEADA: "Cuenta bloqueada por intentos",
  ATAQUE_FUERZA_BRUTA: "Posible ataque de fuerza bruta",
  CAPTCHA_INVALIDO: "Verificación de seguridad inválida",
  LIMITE_EXCEDIDO: "Demasiadas peticiones",
  TOKEN_INVALIDO: "Sesión alterada o falsa",
  ACCESO_DENEGADO: "Acceso a una sección sin permiso",
  ENTRADA_SOSPECHOSA: "Datos con patrón de ataque",
  ARCHIVO_RECHAZADO: "Archivo disfrazado rechazado",
  INTEGRIDAD_ALTERADA: "Código de la aplicación modificado",
  SESIONES_CERRADAS: "Sesiones cerradas por seguridad",
  EMERGENCIA_ACTIVADA: "Bloqueo de emergencia activado",
  EMERGENCIA_DESACTIVADA: "Bloqueo de emergencia levantado",
};
const PERIODOS = { 24: "Últimas 24 horas", 168: "Últimos 7 días", 720: "Últimos 30 días" };
const INTEGRIDAD = {
  INTEGRO: ["Íntegro", "b-verde", "✓", "Los archivos de la aplicación coinciden con la versión instalada."],
  ALTERADO: ["Alterado", "b-rojo", "⛔", "Hay archivos de la aplicación distintos a los instalados. Revisa el servidor."],
  SIN_MANIFIESTO: ["Sin verificar", "b-gris", "ℹ", "La verificación se activa al instalar con Docker (manifiesto de integridad)."],
};

const badgeSev = (s) => {
  const [t, c, i] = SEVERIDAD[s] ?? [s, "b-gris", ""];
  return h("span", { class: `badge ${c}` }, `${i} ${t}`);
};

function tarjeta(etiqueta, valor, detalle, alerta = false) {
  return h(
    "div",
    { class: `card tile${alerta ? " tile-alerta" : ""}` },
    h("div", { class: "tile-l" }, alerta ? h("span", { class: "icono-critico", "aria-hidden": "true" }, "⚠") : null, etiqueta),
    h("div", { class: "tile-n" }, num.format(valor)),
    h("div", { class: "tile-d" }, detalle),
  );
}

export async function vistaSeguridad({ usuario }) {
  const general = usuario.esGeneral;
  const centro = general ? selectorCentro({ etiqueta: "Ver centro" }) : null;
  const horas = h("select", { "aria-label": "Periodo" }, opciones(PERIODOS, "24"));
  const banner = h("div");
  const resumenCont = h("div", { class: "dashboard-cuerpo" });
  const aviso = h("p", { class: "sr-only", "aria-live": "polite" });
  const f = { page: 1, pageSize: 20, severidad: "", atendido: "no", tipo: "" };

  // ───── Resumen, integridad y acciones ─────
  const cargarResumen = async () => {
    montar(resumenCont, cargando());
    try {
      const p = new URLSearchParams({ horas: horas.value });
      if (centro?.value) p.set("centroId", centro.value);
      const r = await api(`/api/seguridad/resumen?${p}`);
      const sin = r.sinAtender;
      aviso.textContent = `Seguridad: ${r.intentosFallidos} intentos fallidos, ${r.ataques} ataques detectados y ${sin.CRITICA} alertas críticas sin atender.`;
      montar(
        banner,
        r.emergencia?.activo
          ? h(
              "div",
              { class: "alert warn", role: "status" },
              `⛔ Bloqueo de emergencia activo desde ${fecha(r.emergencia.desde)}: «${r.emergencia.motivo}». Solo el administrador general puede ingresar.`,
            )
          : sin.CRITICA
            ? h(
                "div",
                { class: "alert", role: "status" },
                `⚠ Hay ${sin.CRITICA} alerta(s) crítica(s) sin atender. Revísalas en la tabla de eventos.`,
              )
            : null,
      );
      const tarjetas = h(
        "div",
        { class: "grid cols-5" },
        tarjeta("Intentos fallidos", r.intentosFallidos, "Contraseña o correo incorrectos"),
        tarjeta("Cuentas bloqueadas", r.cuentasBloqueadas, "Por superar los intentos permitidos", r.cuentasBloqueadas > 0),
        tarjeta("Ataques detectados", r.ataques, "Fuerza bruta desde una misma IP", r.ataques > 0),
        tarjeta("Peticiones bloqueadas", r.bloqueados, "Captcha inválido, exceso o sesión falsa"),
        tarjeta("Entradas sospechosas", r.sospechosos, "Inyección, archivos o accesos sin permiso"),
      );

      const [it, ic, ii, id] = INTEGRIDAD[r.integridad?.estado] ?? INTEGRIDAD.SIN_MANIFIESTO;
      const integridad = h(
        "section",
        { class: "card" },
        h("h2", {}, "Integridad del código"),
        h("p", {}, h("span", { class: `badge ${ic}` }, `${ii} ${it}`), " ", id),
        h("p", { class: "muted small" }, r.integridad?.revisadoEn ? `Última revisión: ${fecha(r.integridad.revisadoEn)}` : "Aún no se ha revisado."),
        r.integridad?.cambios?.length
          ? h(
              "ul",
              { class: "small lista-cambios" },
              r.integridad.cambios.slice(0, 10).map((c) => h("li", {}, h("code", {}, c.archivo), ` · ${c.cambio.toLowerCase()}`)),
            )
          : null,
      );

      montar(resumenCont, tarjetas, h("div", { class: "grid cols-2 dash-fila" }, acciones(r), integridad), ips(r));
    } catch (e) {
      montar(resumenCont, errorBox(e));
    }
  };

  const ips = (r) =>
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Direcciones IP con más alertas"),
      r.ips.length
        ? h(
            "div",
            envolturaTabla("Direcciones IP con más alertas"),
            h(
              "table",
              {},
              h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Dirección IP"), h("th", { scope: "col" }, "Alertas"))),
              h(
                "tbody",
                {},
                r.ips.map((x) => h("tr", {}, h("td", {}, h("code", {}, x.ip)), h("td", {}, num.format(x.veces)))),
              ),
            ),
          )
        : vacio("Sin alertas en este periodo. 🎉"),
    );

  // ───── Acciones de emergencia ─────
  function acciones(r) {
    const alcance = general
      ? selectorCentro({ todos: "Todo el sistema (todos los centros)", etiqueta: "Centro donde se cierran las sesiones" })
      : null;
    const cerrar = h(
      "button",
      {
        class: "btn danger",
        type: "button",
        onclick: async () => {
          const donde = general
            ? alcance.value
              ? alcance.selectedOptions[0].textContent
              : "todo el sistema"
            : `tu centro (${usuario.centro?.codigo ?? ""})`;
          if (
            !(await confirmar(
              "Cerrar todas las sesiones",
              `Se cerrarán todas las sesiones abiertas en ${donde}. Las personas deberán volver a ingresar con su contraseña. Tu sesión seguirá abierta.`,
              "Cerrar sesiones",
              true,
            ))
          )
            return;
          cerrar.disabled = true;
          try {
            const d = await api("/api/seguridad/sesiones/cerrar", {
              method: "POST",
              body: general && alcance.value ? { centroId: Number(alcance.value) } : {},
            });
            reemplazarSesion(d.sesion);
            toast(`Sesiones cerradas en ${donde}`);
            recargar();
          } catch (e) {
            toast(e.message);
          } finally {
            cerrar.disabled = false;
          }
        },
      },
      "Cerrar todas las sesiones",
    );

    const bloques = [
      h("h2", {}, "Acciones de emergencia"),
      h(
        "p",
        { class: "muted small" },
        "Úsalas si sospechas que alguien obtuvo una contraseña o está atacando la plataforma.",
      ),
      h("h3", {}, "Cerrar todas las sesiones"),
      h("p", { class: "small" }, "Saca de inmediato a todas las personas conectadas, incluso si alguien robó una sesión."),
      alcance ? campo("Dónde", alcance) : null,
      cerrar,
    ];

    if (general) {
      const activo = r.emergencia?.activo;
      const motivo = h("input", { type: "text", maxlength: 200, placeholder: "Ej.: Revisión de un acceso no autorizado" });
      const boton = h(
        "button",
        {
          class: `btn ${activo ? "primary" : "danger"}`,
          type: "button",
          onclick: async () => {
            if (!activo && motivo.value.trim().length < 5) {
              toast("Escribe el motivo (mínimo 5 caracteres); lo verán las personas al intentar entrar");
              motivo.focus();
              return;
            }
            const ok = await confirmar(
              activo ? "Levantar el bloqueo de emergencia" : "Activar el bloqueo de emergencia",
              activo
                ? "Todas las personas podrán volver a ingresar a la Mesa de Ayuda."
                : "Nadie, excepto el administrador general, podrá usar la plataforma hasta que levantes el bloqueo. Las sesiones abiertas quedarán en pausa.",
              activo ? "Levantar bloqueo" : "Activar bloqueo",
              !activo,
            );
            if (!ok) return;
            try {
              await api("/api/seguridad/emergencia", {
                method: "PUT",
                body: activo ? { activo: false } : { activo: true, motivo: motivo.value.trim() },
              });
              toast(activo ? "Bloqueo de emergencia levantado" : "Bloqueo de emergencia activado");
              recargar();
            } catch (e) {
              toast(e.message);
            }
          },
        },
        activo ? "Levantar el bloqueo" : "Activar bloqueo de emergencia",
      );
      bloques.push(
        h("h3", {}, "Bloqueo de emergencia (modo mantenimiento)"),
        h(
          "p",
          { class: "small" },
          activo
            ? `Activo desde ${fecha(r.emergencia.desde)} · Motivo: «${r.emergencia.motivo}»`
            : "Detiene toda la plataforma para todos los centros mientras revisas un incidente. Solo tú podrás ingresar.",
        ),
        activo ? null : campo("Motivo (lo verán las personas)", motivo),
        boton,
      );
    }
    return h("section", { class: "card acciones-emergencia" }, ...bloques);
  }

  // ───── Eventos ─────
  const lista = h("div", { "aria-live": "polite" });
  const sSev = h("select", { "aria-label": "Severidad" }, opciones(Object.fromEntries(Object.entries(SEVERIDAD).map(([k, v]) => [k, v[0]])), "", "Todas las severidades"));
  const sAt = h("select", { "aria-label": "Estado" }, opciones({ no: "Sin atender", si: "Atendidos" }, "no", "Todos"));
  const sTipo = h("select", { "aria-label": "Tipo de evento" }, opciones(TIPOS, "", "Todos los tipos"));
  const cargarEventos = async () => {
    montar(lista, cargando());
    const p = new URLSearchParams({ page: f.page, pageSize: f.pageSize });
    for (const k of ["severidad", "atendido", "tipo"]) if (f[k]) p.set(k, f[k]);
    if (centro?.value) p.set("centroId", centro.value);
    try {
      const d = await api(`/api/seguridad/eventos?${p}`);
      montar(
        lista,
        d.items.length
          ? h(
              "div",
              envolturaTabla("Eventos de seguridad"),
              h(
                "table",
                {},
                h(
                  "thead",
                  {},
                  h("tr", {}, ["Última vez", "Severidad", "Evento", "Origen", "Veces", "Estado"].map((t) => h("th", { scope: "col" }, t))),
                ),
                h(
                  "tbody",
                  {},
                  d.items.map((e) =>
                    h(
                      "tr",
                      {},
                      h("td", {}, fecha(e.ultimoEn)),
                      h("td", {}, badgeSev(e.severidad)),
                      h("td", {}, h("strong", {}, e.nombre ?? TIPOS[e.tipo] ?? e.tipo), h("div", { class: "small muted" }, e.descripcion)),
                      h("td", { class: "small" }, e.ip ? h("code", {}, e.ip) : "—", e.correo ? h("div", {}, e.correo) : null),
                      h("td", {}, num.format(e.veces)),
                      h(
                        "td",
                        {},
                        e.atendido
                          ? h("span", { class: "badge b-verde" }, "✓ Atendido")
                          : h(
                              "button",
                              {
                                class: "btn sm",
                                type: "button",
                                onclick: async () => {
                                  try {
                                    await api(`/api/seguridad/eventos/${e.id}/atender`, { method: "PATCH" });
                                    toast("Evento marcado como atendido");
                                    recargar();
                                  } catch (err) {
                                    toast(err.message);
                                  }
                                },
                              },
                              "Marcar atendido",
                            ),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : vacio(f.atendido === "no" ? "No hay eventos pendientes por atender. 🎉" : "Sin eventos con estos filtros."),
        paginador(d.total, d.page, d.pageSize, (n) => {
          f.page = n;
          cargarEventos();
        }),
      );
    } catch (e) {
      montar(lista, errorBox(e));
    }
  };
  for (const [el, k] of [
    [sSev, "severidad"],
    [sAt, "atendido"],
    [sTipo, "tipo"],
  ])
    el.addEventListener("change", () => {
      f[k] = el.value;
      f.page = 1;
      cargarEventos();
    });

  const recargar = () => {
    cargarResumen();
    cargarEventos();
  };
  horas.addEventListener("change", cargarResumen);
  centro?.addEventListener("change", () => {
    f.page = 1;
    recargar();
  });
  recargar();

  return h(
    "div",
    { class: "dashboard seguridad" },
    h(
      "div",
      { class: "page-title" },
      h("h1", {}, general ? "Seguridad" : `Seguridad · ${usuario.centro?.codigo ?? ""}`),
      h("button", { class: "btn", type: "button", onclick: recargar }, "Actualizar"),
    ),
    h(
      "p",
      { class: "muted" },
      general
        ? "Intentos de acceso, ataques detectados y acciones de protección de toda la plataforma."
        : "Intentos de acceso, ataques detectados y acciones de protección de tu centro.",
    ),
    h("div", { class: "card row filtros" }, horas, centro),
    banner,
    aviso,
    resumenCont,
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Eventos de seguridad"),
      h("div", { class: "row filtros" }, sSev, sAt, sTipo),
      lista,
    ),
  );
}
