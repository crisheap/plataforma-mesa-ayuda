/**
 * Datos personales (RF-DAT-01): política de tratamiento y autorización previa, expresa e informada.
 * Marco: Constitución Política (arts. 15 y 20), Ley Estatutaria 1581 de 2012 y Decreto 1377 de 2013,
 * compilado en el Decreto Único Reglamentario 1074 de 2015. El texto debe validarlo el área jurídica
 * o el oficial de protección de datos de la entidad antes de usar la plataforma en producción.
 */
import { api, getUsuario, logout } from "../api.js";
import { h, pieLegal, toast, ENLACES_LEGALES, fecha } from "../ui.js";
import { iconoBot } from "../illustrations.js";

let cache = null;
const politica = () => {
  cache ??= api("/api/auth/politica-datos").catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
};

const canal = (p) =>
  p.contacto
    ? h("span", {}, "el canal ", h("strong", {}, p.contacto))
    : h("span", {}, "los canales de atención del responsable (en el SENA: ", h("strong", {}, "www.sena.edu.co"), ")");

/** Texto completo de la política, agrupado por secciones con encabezados. */
function cuerpoPolitica(p) {
  const s = (titulo, ...hijos) => h("section", { class: "politica-seccion" }, h("h2", {}, titulo), ...hijos);
  const lista = (items) =>
    h(
      "ul",
      {},
      items.map((i) => h("li", {}, i)),
    );
  return [
    s(
      "1. Marco normativo",
      h("p", {}, "Esta política se rige por:"),
      lista([...p.normas, "La política de tratamiento de datos personales del responsable (en el SENA, la publicada en www.sena.edu.co)."]),
    ),
    s(
      "2. Responsable del tratamiento",
      h(
        "p",
        {},
        h("strong", {}, p.responsable),
        ", a través de la Mesa de Ayuda de cada centro de formación. Consultas y reclamos: ",
        canal(p),
        ".",
      ),
    ),
    s(
      "3. Datos que se tratan",
      lista([
        "Identificación y contacto: nombre, apellido, correo de acceso, correo personal (opcional) y número de contacto (opcional) de cada caso.",
        "Información de los casos: descripción, evidencias adjuntas, observaciones, historial y calificación de la atención.",
        "Conversaciones con el asistente Botito: antes de guardarlas se ocultan contraseñas, correos y números largos; se borran al vencer el periodo de retención configurado.",
        "Registros de seguridad: fecha, hora y dirección IP de los ingresos y de las acciones registradas en la bitácora de auditoría.",
      ]),
      h(
        "p",
        {},
        "La plataforma no solicita datos sensibles (salud, origen étnico, orientación política o religiosa, datos biométricos, entre otros). Te pedimos no incluirlos en las descripciones ni en las evidencias.",
      ),
    ),
    s(
      "4. Finalidades",
      lista([
        "Crear y administrar tu cuenta y tu acceso.",
        "Registrar, asignar, atender, cerrar y dar seguimiento a los casos de soporte técnico.",
        "Contactarte sobre tus casos y enviarte notificaciones dentro de la plataforma, por correo y push.",
        "Medir la calidad del servicio con indicadores (tiempos de atención, cumplimiento de SLA y satisfacción).",
        "Proteger la plataforma y conservar la trazabilidad de las acciones (auditoría).",
        "Mejorar las guías del asistente Botito.",
      ]),
      h("p", {}, "Los datos no se venden ni se ceden a terceros para fines distintos a los indicados."),
    ),
    s(
      "5. Tus derechos como titular (Ley 1581 de 2012, art. 8)",
      lista([
        "Conocer, actualizar y rectificar tus datos personales.",
        "Solicitar prueba de la autorización que otorgaste.",
        "Ser informado, previa solicitud, sobre el uso que se ha dado a tus datos.",
        "Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.",
        "Revocar la autorización y/o solicitar la supresión de tus datos cuando no se respeten los principios, derechos y garantías legales; la supresión no procede cuando exista un deber legal o contractual de conservarlos.",
        "Acceder en forma gratuita a tus datos personales que hayan sido objeto de tratamiento.",
      ]),
    ),
    s(
      "6. Cómo ejercer tus derechos",
      h("p", {}, "Escribe a ", canal(p), " o registra un caso en la plataforma indicando tu solicitud."),
      lista([
        "Consultas: se responden en un máximo de diez (10) días hábiles, prorrogables hasta cinco (5) días hábiles más, informándote el motivo (art. 14).",
        "Reclamos (corrección, actualización, supresión o incumplimiento): se responden en un máximo de quince (15) días hábiles, prorrogables hasta ocho (8) días hábiles más (art. 15).",
      ]),
    ),
    s(
      "7. Seguridad y conservación",
      h(
        "p",
        {},
        "Las contraseñas se guardan cifradas, el acceso depende del rol y del centro de cada persona, las sesiones vencen y cada acción relevante queda en una bitácora que no se puede modificar. Los datos se conservan mientras la cuenta esté activa y lo exijan las finalidades y los deberes de archivo del responsable.",
      ),
    ),
    s(
      "8. Autorización y cambios de la política",
      h(
        "p",
        {},
        "Para usar la plataforma debes autorizar el tratamiento de tus datos marcando la casilla correspondiente la primera vez que ingresas. Como prueba se conservan la fecha, la hora, la versión de la política y la dirección IP desde la que autorizaste. Si la política cambia de forma sustancial, se te pedirá una nueva autorización.",
      ),
      h("p", { class: "muted" }, `Versión vigente: ${p.version}.`),
    ),
  ];
}

/** Página pública con la política completa (#/privacidad). */
export function vistaPrivacidad() {
  const cont = h("div", { "aria-live": "polite" }, h("p", { class: "muted" }, "Cargando la política…"));
  politica()
    .then((p) => cont.replaceChildren(...cuerpoPolitica(p)))
    .catch((e) => cont.replaceChildren(h("div", { class: "alert", role: "alert" }, e.message)));
  return h(
    "div",
    { class: "pagina-legal" },
    h(
      "main",
      { class: "card politica" },
      h("div", { class: "row" }, iconoBot(40), h("strong", {}, "Mesa de Ayuda · SENA")),
      h("h1", {}, "Política de tratamiento de datos personales"),
      cont,
      h(
        "p",
        {},
        h(
          "a",
          { class: "btn", href: getUsuario() ? "#/inicio" : "#/login" },
          getUsuario() ? "Volver a la plataforma" : "Volver al inicio de sesión",
        ),
      ),
    ),
    pieLegal(),
  );
}

/** Autorización obligatoria antes de usar la plataforma (primer ingreso o nueva versión de la política). */
export function vistaAutorizacionDatos({ usuario, alAceptar }) {
  const acepto = h("input", { type: "checkbox", id: "acepto-datos" });
  const error = h("div", { class: "alert hidden", role: "alert" });
  const nueva = usuario.autorizacionDatos?.fecha;
  const resumen = h("div", { class: "aviso-datos", id: "autorizar-datos" }, h("p", { class: "muted" }, "Cargando…"));
  let version = usuario.autorizacionDatos?.versionActual;
  politica()
    .then((p) => {
      version = p.version;
      resumen.replaceChildren(
        h(
          "p",
          {},
          h("strong", {}, p.responsable),
          ", responsable del tratamiento, usará tu nombre, tus correos, el número de contacto de tus casos, la información y evidencias de los casos, tus conversaciones con Botito y los registros de seguridad (fecha, hora e IP) para gestionar tu cuenta y tus casos de soporte, contactarte, medir el servicio y proteger la plataforma.",
        ),
        h(
          "p",
          {},
          "Puedes conocer, actualizar, rectificar y suprimir tus datos, revocar esta autorización, pedir prueba de ella y presentar quejas ante la Superintendencia de Industria y Comercio. Norma aplicable: Ley Estatutaria 1581 de 2012 y Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015).",
        ),
        h(
          "p",
          {},
          h("a", { href: ENLACES_LEGALES.privacidad, target: "_blank", rel: "noopener" }, "Lee la política completa"),
          ` · versión ${p.version}`,
        ),
      );
    })
    .catch((e) => resumen.replaceChildren(h("div", { class: "alert", role: "alert" }, e.message)));

  const enviar = async (e) => {
    e.preventDefault();
    error.classList.add("hidden");
    if (!acepto.checked) {
      error.textContent = "Para continuar debes marcar la casilla de autorización.";
      error.classList.remove("hidden");
      acepto.focus();
      return;
    }
    try {
      const perfil = await api("/api/auth/autorizacion-datos", { method: "POST", body: { acepto: true, version } });
      toast("Gracias. Tu autorización quedó registrada");
      alAceptar(perfil);
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove("hidden");
    }
  };

  return h(
    "div",
    { class: "pagina-legal" },
    h(
      "main",
      { class: "card politica" },
      h("div", { class: "row" }, iconoBot(40), h("strong", {}, "Mesa de Ayuda · SENA")),
      h("h1", {}, "Autorización para el tratamiento de datos personales"),
      nueva
        ? h(
            "p",
            { class: "alert info" },
            `La política cambió desde tu última autorización (${fecha(nueva)}). Revísala y autoriza de nuevo para continuar.`,
          )
        : h("p", {}, `Hola, ${usuario.nombre}. Antes de usar la plataforma necesitamos tu autorización.`),
      resumen,
      h(
        "form",
        { onsubmit: enviar },
        error,
        h(
          "label",
          { class: "row casilla", for: "acepto-datos" },
          acepto,
          "Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales conforme a la política de tratamiento de datos personales y a la Ley 1581 de 2012.",
        ),
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn primary", type: "submit" }, "Aceptar y continuar"),
          h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: async () => {
                toast("Sin tu autorización no es posible usar la plataforma. Puedes volver cuando quieras.");
                await logout();
              },
            },
            "No acepto (salir)",
          ),
        ),
      ),
    ),
    pieLegal(),
  );
}
