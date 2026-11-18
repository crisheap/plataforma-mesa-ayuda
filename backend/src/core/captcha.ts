import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../utils/errors";
import { fallosRecientes } from "./seguridad";

/**
 * Captcha propio de prueba de trabajo (RF-SEG-01), sin servicios de terceros ni imágenes:
 * el servidor entrega un desafío firmado y el navegador busca un número (nonce) tal que
 * SHA-256(desafío:nonce) empiece con `bits` ceros. A una persona le toma 1 o 2 segundos;
 * a un programa que prueba miles de contraseñas le cuesta ese tiempo en cada intento.
 * La dificultad sube con los inicios de sesión fallidos recientes desde la misma IP.
 */
const VIGENCIA_MS = 2 * 60_000;
const BITS_EXTRA_MAX = 5;
const clave = createHmac("sha256", env.jwtSecret).update("captcha-mesa-ayuda").digest();
const usados = new Map<string, number>();

const firmar = (desafio: string) => createHmac("sha256", clave).update(desafio).digest("base64url");

export function bitsPara(ip?: string | null): number {
  const extra = Math.min(BITS_EXTRA_MAX, Math.floor(fallosRecientes(ip) / 10));
  return Math.min(24, env.captchaBits + extra);
}

export function emitirDesafio(ip?: string | null) {
  const bits = bitsPara(ip);
  const desafio = `${randomBytes(16).toString("base64url")}.${Date.now() + VIGENCIA_MS}.${bits}`;
  return { algoritmo: "SHA-256", desafio, firma: firmar(desafio), bits, vigenciaSegundos: VIGENCIA_MS / 1000 };
}

/** Número de bits en cero al inicio de un resumen. */
export function cerosIniciales(h: Buffer): number {
  let n = 0;
  for (const byte of h) {
    if (byte === 0) {
      n += 8;
      continue;
    }
    n += Math.clz32(byte) - 24;
    break;
  }
  return n;
}

export interface SolucionCaptcha {
  desafio: string;
  firma: string;
  nonce: string;
}

/** Valida la solución: firma, vigencia, un solo uso y dificultad. Lanza 400 con un mensaje claro si falla. */
export function verificarCaptcha(s: SolucionCaptcha | undefined): void {
  const invalido = (m = "La verificación de seguridad no es válida. Vuelve a intentarlo") =>
    new AppError(400, m, [{ field: "captcha", message: m }]);
  if (!s?.desafio || !s.firma || !s.nonce) throw invalido("Falta la verificación de seguridad (captcha)");
  const partes = s.desafio.split(".");
  if (partes.length !== 3 || !/^\d{1,12}$/.test(s.nonce)) throw invalido();
  const esperada = Buffer.from(firmar(s.desafio));
  const recibida = Buffer.from(s.firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) throw invalido();
  const vence = Number(partes[1]);
  const bits = Number(partes[2]);
  if (!(vence > Date.now())) throw invalido("La verificación de seguridad venció. Vuelve a intentarlo");
  if (usados.has(s.desafio)) throw invalido("Esta verificación ya se usó. Vuelve a intentarlo");
  const h = createHash("sha256").update(`${s.desafio}:${s.nonce}`).digest();
  if (cerosIniciales(h) < bits) throw invalido();
  usados.set(s.desafio, vence);
  if (usados.size > 2000) {
    const ahora = Date.now();
    for (const [k, v] of usados) if (v <= ahora) usados.delete(k);
  }
}

/** Resuelve un desafío (para pruebas automáticas y scripts; el navegador usa un Web Worker). */
export function resolverDesafio(desafio: string, bits: number): string {
  for (let n = 0; ; n++) if (cerosIniciales(createHash("sha256").update(`${desafio}:${n}`).digest()) >= bits) return String(n);
}
