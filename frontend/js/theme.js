/* Tema diurno/nocturno (RF-UI-01/02). Preferencia: "claro" | "oscuro" | "sistema". */
import { api, getUsuario } from "./api.js";

const MAPA_API = { claro: "CLARO", oscuro: "OSCURO", sistema: "SISTEMA" };
const MAPA_INV = { CLARO: "claro", OSCURO: "oscuro", SISTEMA: "sistema" };
const mq = window.matchMedia("(prefers-color-scheme: dark)");

export const preferencia = () => { try { return localStorage.getItem("tema") || "sistema"; } catch { return "sistema"; } };
export const esOscuro = () => document.documentElement.getAttribute("data-theme") === "dark";

export function aplicar(pref = preferencia()) {
  const oscuro = pref === "oscuro" || (pref === "sistema" && mq.matches);
  document.documentElement.setAttribute("data-theme", oscuro ? "dark" : "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", oscuro ? "#0F2A1A" : "#2E7D00");
  document.dispatchEvent(new CustomEvent("tema-cambiado", { detail: { oscuro } }));
}

export async function fijar(pref, { persistir = true } = {}) {
  try { localStorage.setItem("tema", pref); } catch { /* noop */ }
  aplicar(pref);
  if (persistir && getUsuario()) await api("/api/auth/tema", { method: "PATCH", body: { preferenciaTema: MAPA_API[pref] } }).catch(() => undefined);
}
export const alternar = () => fijar(esOscuro() ? "claro" : "oscuro");

/** Al iniciar sesión se respeta la preferencia guardada en el perfil. */
export function aplicarDePerfil(preferenciaTema) {
  const pref = MAPA_INV[preferenciaTema];
  if (pref) { try { localStorage.setItem("tema", pref); } catch { /* noop */ } aplicar(pref); }
}
mq.addEventListener("change", () => { if (preferencia() === "sistema") aplicar("sistema"); });
