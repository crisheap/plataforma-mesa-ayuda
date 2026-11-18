/**
 * Prepara una instalación nueva para las pruebas automáticas (carga, accesibilidad):
 * activa al administrador, crea un usuario de prueba, algunos casos y las cuentas de la
 * prueba de capacidad (una sesión por usuario virtual, como en la vida real).
 * Uso:  node carga/preparar.mjs > credenciales.json
 * Variables: BASE_URL, ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD, CLAVE_PRUEBAS, CUENTAS_CARGA (50).
 */
import { captcha } from "./captcha.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:4000";
const ADMIN = process.env.ADMIN_EMAIL ?? "admin@mesaayuda.local";
const INICIAL = process.env.ADMIN_INITIAL_PASSWORD ?? "";
const CLAVE = process.env.CLAVE_PRUEBAS ?? "Pruebas#2026ok";
const USUARIO = "pruebas@mesaayuda.local";
const CUENTAS = Number(process.env.CUENTAS_CARGA ?? 50);

async function api(metodo, ruta, token, body) {
  if (ruta === "/api/auth/login") body = { ...body, captcha: await captcha(BASE) };
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

/** Inicia sesión con la primera contraseña que funcione y cambia la temporal si hace falta. */
async function sesion(correo, claves) {
  for (const clave of claves.filter(Boolean)) {
    const r = await api("POST", "/api/auth/login", null, { correo, password: clave });
    if (r.status !== 200) continue;
    if (!r.json.data.usuario.debeCambiarPassword) return r.json.data.token;
    const c = await api("PATCH", "/api/auth/password", r.json.data.token, { passwordActual: clave, passwordNueva: CLAVE });
    if (c.status !== 200) throw new Error(`No se pudo cambiar la contraseña de ${correo}: ${JSON.stringify(c.json)}`);
    return (await api("POST", "/api/auth/login", null, { correo, password: CLAVE })).json.data.token;
  }
  throw new Error(`No se pudo iniciar sesión como ${correo}`);
}

const admin = await sesion(ADMIN, [INICIAL, CLAVE]);
// Centro de pruebas (RF-CEN-01): el administrador general crea las cuentas dentro de un centro.
await api("POST", "/api/centros", admin, { codigo: "PRUEBA", nombre: "Centro de Pruebas Automáticas" });
const centro = (await api("GET", "/api/centros", admin)).json.data.find((c) => c.codigo === "PRUEBA");
if (!centro) throw new Error("No se pudo crear el centro de pruebas");
let temporal = null;
const creado = await api("POST", "/api/usuarios", admin, {
  nombre: "Laura",
  apellido: "Pruebas Automáticas",
  correo: USUARIO,
  rol: "USUARIO",
  centroId: centro.id,
});
if (creado.status === 201) temporal = creado.json.data.passwordTemporal;
const usuario = await sesion(USUARIO, [temporal, CLAVE]);

// Cuentas para la prueba de capacidad: cada usuario virtual de k6 usa su propia sesión.
const tokens = [];
for (let i = 1; i <= CUENTAS; i++) {
  const correo = `carga${String(i).padStart(3, "0")}@mesaayuda.local`;
  const c = await api("POST", "/api/usuarios", admin, {
    nombre: "Carga",
    apellido: `Usuario ${i}`,
    correo,
    rol: "USUARIO",
    centroId: centro.id,
  });
  tokens.push(await sesion(correo, [c.status === 201 ? c.json.data.passwordTemporal : null, CLAVE]));
}

const casos = [];
for (const [titulo, categoria] of [
  ["No enciende el monitor de la sala 3", "HARDWARE"],
  ["El WiFi del piso 2 se desconecta", "RED"],
  ["No puedo abrir el correo institucional", "CORREO"],
]) {
  const r = await api("POST", "/api/casos", usuario, {
    titulo,
    descripcion: `${titulo}. Caso creado para pruebas automáticas.`,
    tipo: "INCIDENTE",
    categoria,
  });
  if (r.status !== 201) throw new Error(`No se pudo crear el caso: ${JSON.stringify(r.json)}`);
  casos.push(r.json.data.id);
}

console.log(
  JSON.stringify(
    {
      base: BASE,
      admin: { correo: ADMIN, password: CLAVE },
      usuario: { correo: USUARIO, password: CLAVE },
      casoId: casos[0],
      tokens,
    },
    null,
    2,
  ),
);
