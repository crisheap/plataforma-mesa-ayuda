/* Cliente de la API: token de acceso en memoria, refresco automático y cola sin conexión. */
const RT_KEY = "refreshToken";
const US_KEY = "usuarioCache";
let accessToken = null;
let usuario = null;
let refrescando = null;
const oyentes = new Set();

export class ApiError extends Error {
  constructor(message, status = 0, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
  get sinConexion() {
    return this.status === 0;
  }
}

export const getUsuario = () => usuario;
export const getToken = () => accessToken;
export const alCambiarSesion = (fn) => {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
};
const notificar = () => oyentes.forEach((fn) => { fn(usuario); });

function guardarSesion(d) {
  accessToken = d.token;
  usuario = d.usuario;
  try {
    localStorage.setItem(RT_KEY, d.refreshToken);
    localStorage.setItem(US_KEY, JSON.stringify(d.usuario)); // perfil básico para abrir la app sin conexión
  } catch {
    /* almacenamiento no disponible */
  }
}
function limpiarSesion() {
  accessToken = null;
  usuario = null;
  try {
    localStorage.removeItem(RT_KEY);
    localStorage.removeItem(US_KEY);
  } catch {
    /* noop */
  }
  navigator.serviceWorker?.controller?.postMessage({ tipo: "LIMPIAR_CACHE_API" });
}

async function crudo(ruta, { method = "GET", body, form, auth = true, headers = {} } = {}) {
  const h = { ...headers };
  if (auth && accessToken) h.Authorization = `Bearer ${accessToken}`;
  let cuerpo;
  if (form) cuerpo = form;
  else if (body !== undefined) {
    h["Content-Type"] = "application/json";
    cuerpo = JSON.stringify(body);
  }
  try {
    return await fetch(ruta, { method, headers: h, body: cuerpo });
  } catch {
    throw new ApiError("Sin conexión con el servidor", 0);
  }
}

async function refrescar() {
  const rt = (() => {
    try {
      return localStorage.getItem(RT_KEY);
    } catch {
      return null;
    }
  })();
  if (!rt) return false;
  refrescando ??= (async () => {
    const r = await crudo("/api/auth/refresh", { method: "POST", body: { refreshToken: rt }, auth: false }).catch(() => null);
    if (!r) return "red";
    if (!r.ok) return false;
    guardarSesion((await r.json()).data);
    return true;
  })().finally(() => {
    refrescando = null;
  });
  return refrescando;
}

/** Llamada JSON a la API. `opts.raw` devuelve la Response (descargas). */
export async function api(ruta, opts = {}) {
  let r = await crudo(ruta, opts);
  if (r.status === 401 && opts.auth !== false && (await refrescar()) === true) r = await crudo(ruta, opts);
  if (opts.raw && r.ok) return r;
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* sin cuerpo JSON */
  }
  if (!r.ok) {
    if (r.status === 401 && opts.auth !== false) {
      limpiarSesion();
      notificar();
    }
    throw new ApiError(json?.message ?? `Error ${r.status}`, r.status, json?.errors ?? []);
  }
  return json?.data ?? json;
}

export async function login(correo, password) {
  const r = await crudo("/api/auth/login", { method: "POST", body: { correo, password }, auth: false });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.message ?? "No se pudo iniciar sesión", r.status, j.errors ?? []);
  guardarSesion(j.data);
  notificar();
  return j.data.usuario;
}

/** Restaura la sesión al abrir la app usando el token de refresco. */
export async function restaurarSesion() {
  const r = await refrescar();
  if (r === true) {
    notificar();
    return usuario;
  }
  if (r === "red") {
    // Sin conexión: se abre con el perfil guardado; el token se renueva al reconectar.
    try {
      const guardado = JSON.parse(localStorage.getItem(US_KEY) ?? "null");
      if (guardado && localStorage.getItem(RT_KEY)) {
        usuario = guardado;
        notificar();
        return usuario;
      }
    } catch {
      /* perfil ilegible */
    }
    return null;
  }
  if (r === false) limpiarSesion();
  return null;
}

/** Garantiza un token de acceso vigente (p. ej. al volver la conexión). */
export async function asegurarSesion() {
  if (accessToken) return true;
  return (await refrescar()) === true;
}

export async function logout() {
  const rt = (() => {
    try {
      return localStorage.getItem(RT_KEY);
    } catch {
      return null;
    }
  })();
  if (rt) await crudo("/api/auth/logout", { method: "POST", body: { refreshToken: rt }, auth: false }).catch(() => undefined);
  limpiarSesion();
  notificar();
}

export function actualizarUsuarioLocal(parcial) {
  usuario = { ...usuario, ...parcial };
  notificar();
}

export async function descargar(ruta, nombreSugerido) {
  const r = await api(ruta, { raw: true });
  const blob = await r.blob();
  const cd = r.headers.get("content-disposition") ?? "";
  const nombre = cd.match(/filename="?([^";]+)"?/)?.[1] ?? nombreSugerido;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ───────────── Cola sin conexión (RF-PWA-04) ─────────────
const DB = "mesa-ayuda",
  STORE = "cola";
const abrirDb = () =>
  new Promise((ok, mal) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    q.onsuccess = () => ok(q.result);
    q.onerror = () => mal(q.error);
  });
const tx = async (modo, fn) => {
  const db = await abrirDb();
  return new Promise((ok, mal) => {
    const t = db.transaction(STORE, modo);
    const s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => {
      db.close();
      ok(r?.result);
    };
    t.onerror = () => {
      db.close();
      mal(t.error);
    };
  });
};
export const colaListar = () => tx("readonly", (s) => s.getAll());
export const colaTotal = async () => (await colaListar().catch(() => [])).length;

export async function encolarCaso(datos) {
  await tx("readwrite", (s) => s.add({ ruta: "/api/casos", body: datos, usuarioId: usuario?.id, creadoEn: Date.now() }));
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.sync?.register("enviar-cola");
  } catch {
    /* Background Sync no disponible */
  }
}

let vaciando = false;
/** Envía los casos guardados sin conexión. Devuelve cuántos se enviaron. */
export async function vaciarCola() {
  if (vaciando || !navigator.onLine || !usuario || usuario.debeCambiarPassword) return 0;
  if (!(await asegurarSesion())) return 0;
  vaciando = true;
  let enviados = 0;
  try {
    for (const it of (await colaListar()).filter((x) => x.usuarioId === usuario?.id)) {
      try {
        await api(it.ruta, { method: "POST", body: it.body });
        await tx("readwrite", (s) => s.delete(it.id));
        enviados++;
      } catch (e) {
        if (e.sinConexion) break;
        if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 429)
          await tx("readwrite", (s) => s.delete(it.id)); // datos inválidos: se descarta
        else break;
      }
    }
  } finally {
    vaciando = false;
  }
  return enviados;
}
