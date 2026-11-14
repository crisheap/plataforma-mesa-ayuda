/* PWA: service worker, instalación, actualización y notificaciones push (RF-PWA-01…06). */
import { api } from "./api.js";
import { toast } from "./ui.js";

let promptInstalacion = null;
let registro = null;
const oyentes = new Set();
export const alCambiarInstalable = (fn) => oyentes.add(fn);
export const puedeInstalar = () => Boolean(promptInstalacion);
export const estaInstalada = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  promptInstalacion = e;
  oyentes.forEach((f) => {
    f();
  });
});
window.addEventListener("appinstalled", () => {
  promptInstalacion = null;
  oyentes.forEach((f) => {
    f();
  });
  toast("¡Aplicación instalada!");
});

export async function instalar() {
  if (!promptInstalacion) return false;
  promptInstalacion.prompt();
  const { outcome } = await promptInstalacion.userChoice;
  promptInstalacion = null;
  oyentes.forEach((f) => {
    f();
  });
  return outcome === "accepted";
}

export async function registrarServiceWorker(alMensaje) {
  if (!("serviceWorker" in navigator)) return;
  try {
    registro = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const avisarActualizacion = (w) =>
      toast("Hay una nueva versión disponible", { accion: "Actualizar", ms: 0, onAccion: () => w.postMessage({ tipo: "SKIP_WAITING" }) });
    if (registro.waiting && navigator.serviceWorker.controller) avisarActualizacion(registro.waiting);
    registro.addEventListener("updatefound", () => {
      const w = registro.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) avisarActualizacion(w);
      });
    });
    // Solo se recarga cuando una versión NUEVA reemplaza a otra (no en la primera instalación).
    const teniaControlador = Boolean(navigator.serviceWorker.controller);
    let recargado = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (teniaControlador && !recargado) {
        recargado = true;
        location.reload();
      }
    });
    navigator.serviceWorker.addEventListener("message", (e) => alMensaje?.(e.data));
  } catch (e) {
    console.warn("No se pudo registrar el service worker:", e);
  }
}

// ───────────── Push ─────────────
const b64aU8 = (b64) => {
  const p = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
export const pushSoportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function estadoPush() {
  if (!pushSoportado()) return { soportado: false };
  const cfg = await api("/api/push/clave-publica", { auth: false }).catch(() => ({ habilitado: false }));
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return { soportado: true, habilitado: cfg.habilitado, clave: cfg.clavePublica, activa: Boolean(sub), permiso: Notification.permission };
}

export async function activarPush() {
  const est = await estadoPush();
  if (!est.soportado || !est.habilitado) throw new Error("Las notificaciones push no están disponibles en este servidor");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("No se concedió el permiso de notificaciones");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aU8(est.clave) }));
  await api("/api/push/suscripciones", { method: "POST", body: sub.toJSON() });
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api("/api/push/suscripciones", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}
