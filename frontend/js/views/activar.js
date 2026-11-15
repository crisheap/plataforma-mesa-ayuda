/**
 * Página pública del enlace de acceso (RF-USU-10): #/activar?token=…
 * La persona crea su propia contraseña; el enlace sirve una sola vez y vence en 48 horas.
 */
import { api } from "../api.js";
import { h, campo, montar, cargando } from "../ui.js";
import { iconoBot, icono } from "../illustrations.js";
import * as tema from "../theme.js";

const REGLAS = [
  ["Al menos 10 caracteres", (v) => v.length >= 10],
  ["Una mayúscula", (v) => /[A-ZÁÉÍÓÚÑ]/.test(v)],
  ["Una minúscula", (v) => /[a-záéíóúñ]/.test(v)],
  ["Un número", (v) => /\d/.test(v)],
  ["Un símbolo (por ejemplo # ! $)", (v) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(v)],
];

export function vistaActivar({ token }) {
  const contenido = h("div", { "aria-live": "polite" }, cargando());
  const toggle = h("button", { class: "btn icon-btn", "aria-label": "Cambiar entre modo claro y oscuro", onclick: () => tema.alternar() });
  const pintar = () => toggle.replaceChildren(icono(tema.esOscuro() ? "sol" : "luna"));
  pintar();
  document.addEventListener("tema-cambiado", pintar);

  const irAlLogin = () => {
    location.hash = "#/login";
  };
  const fallo = (mensaje) =>
    montar(
      contenido,
      h("h1", { class: "titulo-acceso" }, "El enlace no está disponible"),
      h("div", { class: "alert", role: "alert" }, mensaje),
      h("p", { class: "muted" }, "Pide al administrador de la Mesa de Ayuda que te envíe un enlace nuevo."),
      h("button", { class: "btn", type: "button", onclick: irAlLogin }, "Ir a iniciar sesión"),
    );

  if (!token) fallo("El enlace está incompleto. Ábrelo de nuevo desde el correo.");
  else
    api("/api/auth/acceso/verificar", { method: "POST", body: { token } })
      .then((d) => formulario(d))
      .catch((e) => fallo(e.sinConexion ? "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo." : e.message));

  function formulario(d) {
    const nueva = h("input", { type: "password", name: "passwordNueva", autocomplete: "new-password", required: true });
    const repetir = h("input", { type: "password", name: "passwordRepetir", autocomplete: "new-password", required: true });
    const reglas = h(
      "ul",
      { class: "small reglas", "aria-label": "Requisitos de la contraseña" },
      REGLAS.map(([t]) => h("li", {}, t)),
    );
    const pintarReglas = () => {
      [...reglas.children].forEach((li, i) => {
        const ok = REGLAS[i][1](nueva.value);
        li.classList.toggle("ok", ok);
        li.textContent = `${ok ? "✓" : "•"} ${REGLAS[i][0]}`;
      });
    };
    pintarReglas();
    nueva.addEventListener("input", pintarReglas);
    const error = h("div", { class: "alert hidden", role: "alert" });
    const boton = h(
      "button",
      { class: "btn primary", type: "submit" },
      d.motivo === "BIENVENIDA" ? "Crear contraseña" : "Guardar contraseña",
    );

    const form = h(
      "form",
      {
        novalidate: true,
        onsubmit: async (e) => {
          e.preventDefault();
          error.classList.add("hidden");
          const faltan = REGLAS.filter(([, ok]) => !ok(nueva.value)).map(([t]) => t.toLowerCase());
          const msg = faltan.length
            ? `A la contraseña le falta: ${faltan.join(", ")}.`
            : nueva.value !== repetir.value
              ? "Las contraseñas no coinciden."
              : "";
          if (msg) {
            error.textContent = msg;
            error.classList.remove("hidden");
            return;
          }
          boton.disabled = true;
          try {
            await api("/api/auth/acceso/activar", { method: "POST", body: { token, passwordNueva: nueva.value } });
            history.replaceState(null, "", "#/activar"); // retira el token de la barra de direcciones
            montar(
              contenido,
              h("h1", { class: "titulo-acceso" }, "¡Listo! Tu contraseña quedó guardada"),
              h("p", {}, `Ya puedes ingresar con tu correo ${d.correo} y la contraseña que acabas de crear.`),
              h("button", { class: "btn primary", type: "button", onclick: irAlLogin }, "Iniciar sesión"),
            );
          } catch (err) {
            error.textContent = [err.message, ...(err.errors ?? []).map((x) => x.message)].join(" · ");
            error.classList.remove("hidden");
            boton.disabled = false;
          }
        },
      },
      campo("Nueva contraseña", nueva),
      reglas,
      campo("Repite la contraseña", repetir),
      error,
      boton,
    );
    montar(
      contenido,
      h("h1", { class: "titulo-acceso" }, d.motivo === "BIENVENIDA" ? `¡Bienvenido(a), ${d.nombreCompleto}!` : `Hola, ${d.nombreCompleto}`),
      h(
        "p",
        { class: "muted" },
        d.motivo === "BIENVENIDA"
          ? "Crea tu contraseña para empezar a usar la Mesa de Ayuda: reporta tus casos de soporte técnico y sigue su avance en un solo lugar."
          : "Crea una contraseña nueva para tu cuenta.",
      ),
      h("p", {}, "Tu usuario de acceso es ", h("strong", {}, d.correo), "."),
      form,
    );
    nueva.focus();
  }

  return h(
    "div",
    { class: "login-form activar" },
    h("div", { class: "theme-float" }, toggle),
    h("div", { class: "card" }, h("div", { class: "row" }, iconoBot(40), h("strong", {}, "Mesa de Ayuda · SENA")), contenido),
  );
}
