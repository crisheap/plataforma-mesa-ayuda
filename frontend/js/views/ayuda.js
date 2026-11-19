/**
 * Ayuda en línea (RF-UI-07): guía de uso de la aplicación dentro de la misma plataforma, sin archivos
 * para descargar. Se abre con el botón «?» y muestra solo lo que aplica al rol de quien la consulta.
 * El contenido es únicamente de uso: no incluye datos de autoría ni del proyecto.
 */
import { h } from "../ui.js";

const T = "TECNICO";
const S = "SUPERVISOR";
const A = "ADMINISTRADOR";
const U = "USUARIO";

/**
 * Secciones de la guía. `roles`: quién la ve (sin `roles`, todos). `general`: solo el administrador general.
 * `antes`: también se muestra antes de iniciar sesión; `soloAntes`: solo antes. Bloques: p (párrafo), pasos (lista numerada),
 * lista (viñetas), tabla ([[título, texto], …]). El texto entre **dobles asteriscos** se resalta.
 */
const SECCIONES = [
  {
    titulo: "Ingresar a la plataforma",
    antes: true,
    bloques: [
      {
        pasos: [
          "Escribe tu **correo de acceso** y tu **contraseña**.",
          "Espera el mensaje **«Verificación de seguridad lista ✓»**: el navegador lo hace solo en 1 o 2 segundos, no tienes que resolver imágenes.",
          "Presiona **Ingresar**.",
          "Si te entregaron una **contraseña temporal**, la plataforma te pedirá cambiarla: escribe la temporal como actual y define una nueva.",
        ],
      },
      {
        lista: [
          "La contraseña debe tener mínimo **10 caracteres**, con mayúscula, minúscula, número y símbolo (por ejemplo # ! $).",
          "Tras **3 intentos fallidos** la cuenta se bloquea **15 minutos**.",
          "Nadie de la mesa de ayuda, ni Botito, te pedirá tu contraseña.",
        ],
      },
    ],
  },
  {
    titulo: "Activar tu cuenta con el correo de bienvenida",
    antes: true,
    soloAntes: true,
    bloques: [
      {
        pasos: [
          "Abre el correo de bienvenida y presiona **Crear mi contraseña**. El enlace sirve una sola vez y vence en 48 horas.",
          "Escribe la contraseña nueva dos veces; las reglas se marcan en verde a medida que las cumples.",
          "Presiona **Crear contraseña** y luego **Iniciar sesión**.",
        ],
      },
      {
        p: "Si el enlace ya no está disponible, pide al administrador de tu centro que te envíe uno nuevo. Revisa también la carpeta de spam.",
      },
    ],
  },
  {
    titulo: "La pantalla principal",
    bloques: [
      {
        tabla: [
          ["☰ Menú", "Muestra solo las opciones de tu rol. En el celular se abre con este botón."],
          ["☾ / ☀", "Cambia entre modo nocturno y diurno."],
          ["?", "Abre esta ayuda."],
          ["🔔 Campana", "Tus notificaciones; el número rojo indica las que no has leído."],
          ["Botito", "El botón redondo del robot, abajo a la derecha: el asistente de ayuda."],
          ["Salir", "Cierra tu sesión. Úsalo siempre en equipos compartidos."],
        ],
      },
    ],
  },
  {
    titulo: "Estados de un caso",
    bloques: [
      {
        tabla: [
          ["Abierto", "Se registró y espera que lo asignen a un técnico."],
          ["Asignado", "Ya tiene técnico y prioridad."],
          ["En proceso", "El técnico está trabajando en él."],
          ["Resuelto", "El técnico propuso una solución y espera la confirmación de quien lo reportó."],
          ["Cerrado", "La solución se confirmó; ya no admite cambios."],
        ],
      },
    ],
  },
  {
    titulo: "Reportar un caso",
    roles: [U, T],
    bloques: [
      {
        pasos: [
          "En el menú elige **Nuevo caso**.",
          "**Título:** resume el problema en una frase, por ejemplo «No puedo conectarme al WiFi del piso 2».",
          "**Descripción:** cuenta qué pasó, desde cuándo y qué intentaste. Incluye el mensaje de error exacto si lo hay.",
          "Elige el **tipo de caso** y la **categoría** que mejor lo describan.",
          "Si quieres que te llamen, escribe un **número de contacto** (opcional).",
          "Adjunta **evidencias** si ayudan: capturas, fotos, PDF o un video corto (hasta 5 archivos de 10 MB).",
          "Presiona **Enviar caso** y guarda el **número de caso** que aparece.",
        ],
      },
      {
        tabla: [
          ["Incidente", "Algo que funcionaba dejó de funcionar."],
          ["Requerimiento", "Necesitas algo nuevo: instalar un programa, configurar un equipo."],
          ["Mantenimiento", "Un equipo necesita revisión, limpieza o cambio de piezas."],
          ["Solicitud de acceso", "Necesitas permisos o una cuenta en un sistema o carpeta."],
        ],
      },
    ],
  },
  {
    titulo: "Seguir y cerrar mis casos",
    roles: [U, T],
    bloques: [
      {
        p: "En **Mis casos** ves tus reportes con su estado. Al abrir uno ves el técnico asignado, el historial, los comentarios y las evidencias.",
      },
      {
        lista: [
          "Responde al técnico con **Comentar**.",
          "Cuando el caso quede **Resuelto**: si se solucionó, presiona **Sí, se resolvió: cerrar caso**; si no, **No se resolvió** y explica qué sigue fallando.",
          "Al cerrarlo, **califica la atención** de 1 a 5 estrellas.",
        ],
      },
    ],
  },
  {
    titulo: "Pedir ayuda a Botito",
    bloques: [
      {
        lista: [
          "Ábrelo con el botón del robot y escribe tu problema con tus palabras, por ejemplo «el wifi no funciona».",
          "Pregunta «¿cómo va mi caso?» o escribe el número del caso para conocer su estado.",
          "Si no lo resuelve, usa **Crear un caso con esta información**: el formulario queda diligenciado para que lo revises y lo envíes.",
          "Marca **Me ayudó** o **No me ayudó** para mejorar las respuestas.",
        ],
      },
    ],
  },
  {
    titulo: "Atender los casos asignados",
    roles: [T],
    bloques: [
      { p: "En **Casos asignados** los casos aparecen ordenados por vencimiento y prioridad: atiéndelos de arriba hacia abajo." },
      {
        pasos: [
          "Abre el caso y presiona **Iniciar atención**.",
          "Usa **Comentar** para pedir información o informar avances. Marca **Nota interna** si el comentario es solo para el equipo de soporte.",
          "Al terminar, presiona **Marcar como resuelto** y describe qué hiciste.",
        ],
      },
      {
        tabla: [
          ["En tiempo", "Queda más del 25 % del tiempo de atención."],
          ["En riesgo", "Se usó el 75 % o más del tiempo: dale prioridad."],
          ["Vencido", "Superó el tiempo máximo."],
        ],
      },
    ],
  },
  {
    titulo: "Asignar y priorizar casos",
    roles: [S, A],
    bloques: [
      {
        pasos: [
          "En **Todos los casos** filtra por **Abierto**.",
          "Abre el caso y elige el **técnico**; junto a cada nombre ves cuántos casos activos tiene.",
          "Elige la **prioridad** (Alta, Media o Baja) y presiona **Asignar**.",
        ],
      },
      {
        lista: [
          "**Reasignar** cambia el técnico sin perder el avance.",
          "Cambiar la prioridad recalcula el vencimiento.",
          "Puedes cerrar un caso resuelto si quien lo reportó no responde.",
        ],
      },
    ],
  },
  {
    titulo: "Dashboard y Excel",
    roles: [S, A],
    bloques: [
      {
        p: "El **Dashboard** muestra el total de casos, los por realizar, en proceso, realizados y vencidos, con gráficas de avance, calidad del servicio y carga por técnico.",
      },
      {
        lista: [
          "Filtra por fechas, prioridad o técnico.",
          "Cada gráfica tiene **Ver los datos en tabla**.",
          "**Descargar Excel** genera el archivo con los mismos datos y filtros.",
        ],
      },
    ],
  },
  {
    titulo: "Auditoría",
    roles: [S, A],
    bloques: [{ p: "En **Auditoría** ves quién hizo qué y cuándo. Filtra por acción, entidad y fechas. Es de solo lectura." }],
  },
  {
    titulo: "Corregir datos de las personas",
    roles: [S],
    bloques: [
      {
        pasos: [
          "En **Usuarios** busca a la persona y presiona **Corregir datos**.",
          "Corrige el nombre, el apellido o el correo personal y presiona **Guardar**.",
        ],
      },
      {
        p: "Puedes corregir a usuarios y técnicos de tu centro. El rol, el centro, el correo de acceso y el estado de la cuenta los cambia el administrador.",
      },
    ],
  },
  {
    titulo: "Crear y gestionar usuarios",
    roles: [A],
    bloques: [
      {
        pasos: [
          "En **Usuarios** presiona **Nuevo usuario**.",
          "Escribe nombre, apellido y **correo de acceso**. Un correo solo puede pertenecer a una persona en toda la plataforma.",
          "Revisa el **tipo de correo** y, si es empresarial, agrega un **correo personal** opcional.",
          "Elige el **rol**, deja marcada la casilla del correo de bienvenida y presiona **Crear usuario**.",
        ],
      },
      {
        tabla: [
          ["Editar", "Nombre, apellido, rol, correos. El correo de acceso se corrige solo si quedó mal escrito."],
          ["Enviar acceso", "Envía un enlace nuevo para crear o restablecer la contraseña."],
          ["Bloquear / Desbloquear", "Impide o permite el ingreso de inmediato."],
          ["Dar de baja", "Deja la cuenta inactiva sin borrar su historial."],
          ["Contraseña temporal", "Genera una contraseña que entregas tú; la persona debe cambiarla."],
        ],
      },
    ],
  },
  {
    titulo: "Seguridad",
    roles: [A],
    bloques: [
      {
        p: "En **Seguridad** ves los intentos fallidos, las cuentas bloqueadas, los ataques detectados y las alertas. Revisa cada evento y presiona **Marcar atendido**.",
      },
      {
        lista: [
          "**Cerrar todas las sesiones** saca a todas las personas conectadas; deberán volver a ingresar.",
          "**Bloqueo de emergencia** (administrador general) detiene la plataforma para todos mientras se revisa un incidente. Escribe el motivo y levántalo al terminar.",
          "Si **Integridad del código** dice **Alterado**, avisa de inmediato al equipo técnico.",
        ],
      },
    ],
  },
  {
    titulo: "Centros y sus administradores",
    roles: [A],
    general: true,
    bloques: [
      {
        pasos: [
          "En **Centros** presiona **Nuevo centro** y escribe el código y el nombre.",
          "Se abre el formulario para crear el **administrador** del centro; complétalo y créalo.",
          "Usa el filtro **Centro** en Usuarios, Casos, Dashboard y Auditoría para ver uno o todos.",
        ],
      },
    ],
  },
  {
    titulo: "SLA, Base del asistente y Configuración",
    roles: [A],
    general: true,
    bloques: [
      {
        tabla: [
          ["SLA", "Tiempo máximo de atención por prioridad. Al guardar, los casos abiertos recalculan su vencimiento."],
          ["Base del asistente", "Guías de Botito: título claro, pasos cortos y palabras clave. Desactiva en lugar de borrar."],
          ["Configuración", "Dominios de correo empresarial de la entidad, uno por línea."],
        ],
      },
    ],
  },
  {
    titulo: "Mi perfil, la aplicación y el uso sin internet",
    bloques: [
      {
        lista: [
          "En **Mi perfil** cambias la apariencia y tu contraseña, y activas las **notificaciones push**.",
          "Instala la aplicación con **Mi perfil → Aplicación → Instalar** o, en el celular, con «Añadir a la pantalla de inicio».",
          "Sin internet puedes redactar un caso: se envía solo al volver la conexión. Las evidencias se agregan después.",
        ],
      },
    ],
  },
  {
    titulo: "Problemas frecuentes",
    antes: true,
    bloques: [
      {
        tabla: [
          ["Cuenta bloqueada temporalmente", "Espera los minutos indicados o pide al administrador que la desbloquee."],
          ["Olvidé mi contraseña", "Pide al administrador que te envíe un enlace de acceso."],
          ["No me llegó el correo de bienvenida", "Revisa spam o pide al administrador que use **Enviar acceso**."],
          ["«Tu sesión se cerró por seguridad»", "Vuelve a ingresar con tu contraseña."],
          ["«Mantenimiento por seguridad»", "La plataforma está detenida un momento; presiona **Reintentar** en unos minutos."],
          ["«Sin conexión»", "Revisa tu internet; puedes seguir redactando casos."],
          ["La pantalla se ve desordenada", "Recarga con Ctrl + F5."],
        ],
      },
    ],
  },
];

/** Convierte **texto** en <strong> sin usar innerHTML. */
function texto(s) {
  return s.split(/(\*\*[^*]+\*\*)/).map((t) => (t.startsWith("**") && t.endsWith("**") ? h("strong", {}, t.slice(2, -2)) : t));
}

function bloque(b) {
  if (b.p) return h("p", {}, texto(b.p));
  if (b.pasos)
    return h(
      "ol",
      {},
      b.pasos.map((x) => h("li", {}, texto(x))),
    );
  if (b.lista)
    return h(
      "ul",
      {},
      b.lista.map((x) => h("li", {}, texto(x))),
    );
  if (b.tabla)
    return h(
      "dl",
      { class: "ayuda-tabla" },
      b.tabla.flatMap(([t, d]) => [h("dt", {}, texto(t)), h("dd", {}, texto(d))]),
    );
  return null;
}

/** Secciones que aplican a quien consulta (sin sesión: solo las de ingreso y problemas frecuentes). */
export function seccionesPara(usuario) {
  if (!usuario) return SECCIONES.filter((s) => s.antes);
  return SECCIONES.filter((s) => !s.soloAntes && (!s.roles || s.roles.includes(usuario.rol)) && (!s.general || usuario.esGeneral));
}

/** Abre la ayuda en una ventana dentro de la aplicación. */
export function abrirAyuda(usuario) {
  document.querySelector("dialog.dlg-ayuda")?.remove();
  const secciones = seccionesPara(usuario);
  const buscar = h("input", {
    type: "search",
    placeholder: "Buscar en la ayuda (por ejemplo: contraseña)",
    "aria-label": "Buscar en la ayuda",
  });
  const sinResultados = h("p", { class: "muted hidden", role: "status" }, "No hay temas con esa palabra.");
  const items = secciones.map((s, i) =>
    h("details", { class: "ayuda-seccion", ...(i === 0 ? { open: "" } : {}) }, h("summary", {}, s.titulo), ...s.bloques.map(bloque)),
  );
  const normal = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  buscar.addEventListener("input", () => {
    const q = normal(buscar.value.trim());
    let visibles = 0;
    for (const d of items) {
      const ok = !q || normal(d.textContent).includes(q);
      d.classList.toggle("hidden", !ok);
      if (ok) visibles++;
      if (q) d.open = ok;
    }
    sinResultados.classList.toggle("hidden", visibles > 0);
  });
  const dlg = h(
    "dialog",
    { class: "dlg-ayuda", "aria-labelledby": "ayuda-t" },
    h(
      "div",
      { class: "ayuda-cabeza" },
      h("h2", { id: "ayuda-t" }, "¿Cómo se usa la Mesa de Ayuda?"),
      h("button", { class: "btn sm", type: "button", onclick: () => dlg.close() }, "Cerrar"),
    ),
    h(
      "div",
      { class: "ayuda-cuerpo" },
      h(
        "p",
        { class: "muted small" },
        usuario ? "Estos son los temas para tu rol. Toca un tema para abrirlo." : "Temas para ingresar a la plataforma.",
      ),
      buscar,
      sinResultados,
      ...items,
    ),
  );
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close(); // clic fuera del contenido
  });
  document.body.append(dlg);
  dlg.showModal();
  buscar.focus();
}

/** Botón «?» que abre la ayuda. */
export function botonAyuda(obtenerUsuario) {
  return h(
    "button",
    {
      class: "btn icon-btn btn-ayuda",
      type: "button",
      "aria-label": "Ayuda",
      title: "Ayuda",
      onclick: () => abrirAyuda(obtenerUsuario()),
    },
    h("span", { "aria-hidden": "true" }, "?"),
  );
}
