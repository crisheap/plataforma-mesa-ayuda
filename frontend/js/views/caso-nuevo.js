import { api, encolarCaso, ApiError } from "../api.js";
import { h, campo, opciones, toast, TIPOS, CATEGORIAS } from "../ui.js";

const MAX_MB = 10;
const ACEPTA = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.log,.docx,.xlsx,.mp4,.webm";

export async function vistaCasoNuevo() {
  let pre = {};
  try {
    pre = JSON.parse(sessionStorage.getItem("prefillCaso") ?? "{}");
    sessionStorage.removeItem("prefillCaso");
  } catch {
    /* noop */
  }

  const titulo = h("input", {
    type: "text",
    maxlength: "150",
    required: true,
    value: pre.titulo ?? "",
    placeholder: "Ej.: No puedo conectarme al WiFi del piso 2",
  });
  const descripcion = h("textarea", { maxlength: "4000", required: true }, pre.descripcion ?? "");
  const tipo = h("select", {}, opciones(TIPOS, pre.tipo ?? "INCIDENTE"));
  const categoria = h("select", {}, opciones(CATEGORIAS, pre.categoria ?? "SOFTWARE"));
  const telefono = h("input", {
    type: "tel",
    inputmode: "tel",
    autocomplete: "tel",
    maxlength: "20",
    placeholder: "Ej.: 300 123 4567",
    value: pre.telefonoContacto ?? "",
  });
  const archivos = h("input", { type: "file", multiple: true, accept: ACEPTA });
  const error = h("div", { class: "alert hidden", role: "alert" });
  const boton = h("button", { class: "btn primary", type: "submit" }, "Enviar caso");
  const errores = (e) => [e.message, ...(e.errors ?? []).map((x) => `${x.field}: ${x.message}`)].join(" · ");

  const form = h(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        error.classList.add("hidden");
        const datos = {
          titulo: titulo.value.trim(),
          descripcion: descripcion.value.trim(),
          tipo: tipo.value,
          categoria: categoria.value,
          telefonoContacto: telefono.value.trim() || undefined,
        };
        const grandes = [...archivos.files].filter((f) => f.size > MAX_MB * 1024 * 1024);
        if (datos.titulo.length < 5 || datos.descripcion.length < 10) {
          error.textContent = "El título debe tener al menos 5 caracteres y la descripción al menos 10.";
          error.classList.remove("hidden");
          return;
        }
        const digitos = (datos.telefonoContacto ?? "").replace(/\D/g, "").length;
        if (datos.telefonoContacto && (!/^\+?[\d\s()-]+$/.test(datos.telefonoContacto) || digitos < 7 || digitos > 15)) {
          error.textContent = "El número de contacto debe tener entre 7 y 15 dígitos (puedes usar +, espacios y guiones).";
          error.classList.remove("hidden");
          telefono.focus();
          return;
        }
        if (grandes.length) {
          error.textContent = `Cada archivo debe pesar máximo ${MAX_MB} MB: ${grandes.map((f) => f.name).join(", ")}`;
          error.classList.remove("hidden");
          return;
        }
        boton.disabled = true;
        boton.textContent = "Enviando…";
        try {
          if (!navigator.onLine) throw new ApiError("Sin conexión", 0);
          const caso = await api("/api/casos", { method: "POST", body: datos });
          if (pre.conversacionId)
            api(`/api/asistente/conversaciones/${pre.conversacionId}/caso`, { method: "PATCH", body: { casoId: caso.id } }).catch(
              () => undefined,
            );
          if (archivos.files.length) {
            const fd = new FormData();
            for (const f of archivos.files) fd.append("archivos", f);
            try {
              await api(`/api/casos/${caso.id}/evidencias`, { method: "POST", form: fd });
            } catch (er) {
              toast(`Caso creado, pero las evidencias no se pudieron adjuntar: ${er.message}`, { ms: 8000 });
            }
          }
          toast(`Caso ${caso.numeroCaso} registrado`);
          location.hash = `#/casos/${caso.id}`;
        } catch (er) {
          if (er.sinConexion) {
            await encolarCaso(datos);
            toast("Sin conexión: tu caso quedó guardado y se enviará automáticamente al recuperar internet.", { ms: 8000 });
            if (archivos.files.length) toast("Las evidencias deberás adjuntarlas después, desde el detalle del caso.", { ms: 8000 });
            location.hash = "#/mis-casos";
          } else {
            error.textContent = errores(er);
            error.classList.remove("hidden");
          }
        } finally {
          boton.disabled = false;
          boton.textContent = "Enviar caso";
        }
      },
    },
    error,
    campo("Título", titulo, "Resume el problema en una frase."),
    campo("Descripción", descripcion, "Cuenta qué pasó, cuándo empezó y qué intentaste."),
    h("div", { class: "grid cols-2" }, campo("Tipo de caso", tipo), campo("Categoría", categoria)),
    campo(
      "Número de contacto (opcional)",
      telefono,
      "El técnico asignado lo usará para llamarte o escribirte. Solo lo ven tú, el técnico y los supervisores.",
    ),
    campo("Evidencias (opcional)", archivos, `Imágenes, PDF, documentos o videos. Máximo ${MAX_MB} MB por archivo y 5 archivos.`),
    h("div", { class: "row" }, boton, h("a", { class: "btn", href: "#/inicio" }, "Cancelar")),
  );

  // Propone el número usado en el caso más reciente del usuario (RF-CAS-14).
  if (!telefono.value && navigator.onLine) {
    api("/api/casos/mis-casos?page=1&pageSize=1")
      .then((r) => {
        const ultimo = r?.items?.[0]?.telefonoContacto;
        if (ultimo && !telefono.value) telefono.value = ultimo;
      })
      .catch(() => undefined);
  }

  return h(
    "div",
    {},
    h("div", { class: "page-title" }, h("h1", {}, "Nuevo caso")),
    pre.titulo || pre.descripcion
      ? h("div", { class: "alert info" }, "Botito prellenó este formulario con lo que conversaron. Revísalo antes de enviarlo.")
      : null,
    h("div", { class: "card" }, form),
  );
}
