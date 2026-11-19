import { api, login, tomarAvisoSesion } from "../api.js";
import { avisoCaptcha, tomarCaptcha } from "../captcha.js";
import { h, campo, toast, pieLegal } from "../ui.js";
import { heroTecnico, iconoBot, icono } from "../illustrations.js";
import * as tema from "../theme.js";
import { botonAyuda } from "./ayuda.js";

export function vistaLogin({ alIngresar }) {
  const correo = h("input", {
    type: "email",
    name: "correo",
    autocomplete: "username",
    required: true,
    placeholder: "tucorreo@sena.edu.co",
    inputmode: "email",
  });
  const pass = h("input", { type: "password", name: "password", autocomplete: "current-password", required: true });
  const error = h("div", { class: "alert hidden", role: "alert" });
  const avisoSesion = tomarAvisoSesion();
  if (avisoSesion) {
    error.textContent = avisoSesion;
    error.classList.remove("hidden");
  }
  const verificacion = avisoCaptcha(h);
  const boton = h("button", { class: "btn primary", type: "submit", style: null }, "Ingresar");
  const ver = h(
    "button",
    {
      class: "btn sm",
      type: "button",
      "aria-pressed": "false",
      onclick: () => {
        const mostrar = pass.type === "password";
        pass.type = mostrar ? "text" : "password";
        ver.textContent = mostrar ? "Ocultar contraseña" : "Mostrar contraseña";
        ver.setAttribute("aria-pressed", String(mostrar));
      },
    },
    "Mostrar contraseña",
  );

  const form = h(
    "form",
    {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        error.classList.add("hidden");
        if (!correo.value.trim() || !pass.value) {
          error.textContent = "Escribe tu correo y contraseña";
          error.classList.remove("hidden");
          return;
        }
        boton.disabled = true;
        boton.textContent = "Ingresando…";
        try {
          await alIngresar(await login(correo.value.trim(), pass.value, await tomarCaptcha()));
        } catch (err) {
          verificacion.reiniciar(); // cada intento usa una verificación nueva
          error.textContent = err.sinConexion ? "No hay conexión con el servidor. Revisa tu internet." : err.message;
          error.classList.remove("hidden");
          pass.value = "";
          pass.focus();
        } finally {
          boton.disabled = false;
          boton.textContent = "Ingresar";
        }
      },
    },
    campo("Correo de acceso", correo),
    campo("Contraseña", pass),
    h("div", { class: "field" }, ver),
    error,
    verificacion.el,
    boton,
  );

  const toggle = h("button", { class: "btn icon-btn", "aria-label": "Cambiar entre modo claro y oscuro", onclick: () => tema.alternar() });
  const pintar = () => toggle.replaceChildren(icono(tema.esOscuro() ? "sol" : "luna"));
  pintar();
  document.addEventListener("tema-cambiado", pintar);

  return h(
    "div",
    { class: "login" },
    h("div", { class: "theme-float" }, botonAyuda(() => null), toggle),
    h(
      "section",
      { class: "login-art", "aria-label": "Presentación" },
      h("div", { class: "row" }, iconoBot(48), h("strong", {}, "Mesa de Ayuda · SENA")),
      h(
        "div",
        {},
        h("h1", {}, "Soporte técnico a un clic"),
        h("p", {}, "Reporta tus casos, sigue su avance y recibe ayuda inmediata de nuestro asistente."),
      ),
      h("div", { class: "art" }, heroTecnico()),
    ),
    h(
      "section",
      { class: "login-form" },
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Inicia sesión"),
        h("p", { class: "muted" }, "Usa el correo con el que te registró la Mesa de Ayuda."),
        form,
      ),
      h(
        "p",
        { class: "small muted aviso-ingreso" },
        "Al ingresar se te pedirá autorizar el tratamiento de tus datos personales según la ",
        h("a", { href: "#/privacidad" }, "política de tratamiento de datos"),
        " (Ley 1581 de 2012).",
      ),
      pieLegal(),
    ),
  );
}

/** Pantalla obligatoria cuando la cuenta tiene contraseña temporal o fue restablecida. */
export function vistaCambioPasswordObligatorio({ alTerminar }) {
  const actual = h("input", { type: "password", autocomplete: "current-password", required: true });
  const nueva = h("input", { type: "password", autocomplete: "new-password", required: true });
  const repetir = h("input", { type: "password", autocomplete: "new-password", required: true });
  const error = h("div", { class: "alert hidden", role: "alert" });
  const form = h(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        error.classList.add("hidden");
        if (nueva.value !== repetir.value) {
          error.textContent = "Las contraseñas nuevas no coinciden";
          error.classList.remove("hidden");
          return;
        }
        try {
          await api("/api/auth/password", { method: "PATCH", body: { passwordActual: actual.value, passwordNueva: nueva.value } });
          toast("Contraseña actualizada. Inicia sesión con la nueva contraseña.");
          const { logout } = await import("../api.js");
          await logout();
          alTerminar();
        } catch (err) {
          error.textContent = [err.message, ...(err.errors ?? []).map((x) => x.message)].join(" · ");
          error.classList.remove("hidden");
        }
      },
    },
    error,
    campo("Contraseña actual (temporal)", actual),
    campo("Nueva contraseña", nueva, "Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo."),
    campo("Repite la nueva contraseña", repetir),
    h("button", { class: "btn primary", type: "submit" }, "Cambiar contraseña"),
  );
  return h(
    "div",
    { class: "login-form", style: null },
    h(
      "div",
      { class: "card" },
      h("h2", {}, "Debes cambiar tu contraseña"),
      h("p", { class: "muted" }, "Por seguridad, define una contraseña personal antes de continuar."),
      form,
    ),
    pieLegal(),
  );
}
