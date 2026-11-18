/**
 * Resuelve el captcha propio de la plataforma (RF-SEG-01) para los scripts de pruebas.
 * Es la misma prueba de trabajo que hace el navegador: buscar un número cuyo SHA-256
 * junto al desafío empiece con la cantidad de bits en cero que pide el servidor.
 * Uso como comando:  node carga/captcha.mjs <correo> <contraseña>   → imprime el código HTTP del login
 */
import { createHash } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:4000";

function ceros(buf) {
  let n = 0;
  for (const b of buf) {
    if (b === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(b) - 24;
  }
  return n;
}

export async function captcha(base = BASE) {
  const { data } = await (await fetch(`${base}/api/auth/captcha`)).json();
  for (let i = 0; ; i++) {
    if (ceros(createHash("sha256").update(`${data.desafio}:${i}`).digest()) >= data.bits)
      return { desafio: data.desafio, firma: data.firma, nonce: String(i) };
  }
}

if (process.argv[1]?.endsWith("captcha.mjs") && process.argv[3]) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ correo: process.argv[2], password: process.argv[3], captcha: await captcha() }),
  });
  console.log(r.status);
}
