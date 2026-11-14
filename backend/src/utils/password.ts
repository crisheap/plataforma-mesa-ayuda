import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

const COSTO = 12;

/** Política (RNF-01): mínimo 10 caracteres con mayúscula, minúscula, número y símbolo. */
export function validarPolitica(password: string): string[] {
  const fallas: string[] = [];
  if (password.length < 10) fallas.push("debe tener al menos 10 caracteres");
  if (password.length > 72) fallas.push("no puede superar 72 caracteres");
  if (!/[a-z]/.test(password)) fallas.push("debe incluir una letra minúscula");
  if (!/[A-Z]/.test(password)) fallas.push("debe incluir una letra mayúscula");
  if (!/[0-9]/.test(password)) fallas.push("debe incluir un número");
  if (!/[^A-Za-z0-9]/.test(password)) fallas.push("debe incluir un símbolo");
  return fallas;
}

export const hashPassword = (p: string) => bcrypt.hash(p, COSTO);
export const compararPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

/** Hash ficticio para igualar tiempos cuando el usuario no existe. */
export const HASH_FICTICIO = bcrypt.hashSync("no-existe-" + randomBytes(8).toString("hex"), COSTO);

/** Contraseña temporal que cumple la política. */
export function generarPasswordTemporal(): string {
  const base = randomBytes(9)
    .toString("base64")
    .replace(/[^A-Za-z0-9]/g, "x");
  return `${base}Aa1!`.slice(0, 16);
}
