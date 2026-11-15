/**
 * Tipo de correo de las cuentas (RF-USU-09) y dominios empresariales configurables (RF-ADM-05).
 *
 * Regla: un correo cuyo dominio (o subdominio) está en la lista de dominios empresariales es
 * EMPRESARIAL; cualquier otro es PERSONAL. El administrador define la lista y puede cambiar el
 * tipo de cada usuario manualmente.
 */
import type { TipoCorreo } from "../generated/prisma/client";
import { env } from "../config/env";
import { prisma } from "../config/prisma";

const CLAVE_DOMINIOS = "dominiosEmpresariales";

/** Proveedores públicos más comunes (referencia para la interfaz). */
export const PROVEEDORES_PERSONALES = [
  "gmail.com",
  "hotmail.com",
  "hotmail.es",
  "outlook.com",
  "outlook.es",
  "live.com",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "protonmail.com",
];

export const DOMINIO_VALIDO = /^(?=.{3,120}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export const dominioDe = (correo: string) => correo.split("@").pop()?.trim().toLowerCase() ?? "";

/** EMPRESARIAL si el dominio coincide con uno de la lista (o es un subdominio suyo). */
export function clasificarCorreo(correo: string, empresariales: string[]): TipoCorreo {
  const d = dominioDe(correo);
  return empresariales.some((e) => d === e || d.endsWith(`.${e}`)) ? "EMPRESARIAL" : "PERSONAL";
}

export function normalizarDominios(lista: string[]): string[] {
  return [...new Set(lista.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))].sort();
}

export async function dominiosEmpresariales(): Promise<string[]> {
  const c = await prisma.configuracionSistema.findUnique({ where: { clave: CLAVE_DOMINIOS } });
  return Array.isArray(c?.valor) ? (c.valor as string[]) : env.dominiosEmpresariales;
}

/**
 * Guarda la lista de dominios empresariales. Con `reclasificar`, actualiza el tipo de correo de
 * todas las cuentas según la nueva lista y devuelve cuántas cambiaron.
 */
export async function guardarDominiosEmpresariales(lista: string[], reclasificar: boolean) {
  const dominios = normalizarDominios(lista);
  await prisma.configuracionSistema.upsert({
    where: { clave: CLAVE_DOMINIOS },
    create: { clave: CLAVE_DOMINIOS, valor: dominios },
    update: { valor: dominios },
  });
  let reclasificados = 0;
  if (reclasificar) {
    const usuarios = await prisma.usuario.findMany({ select: { id: true, correo: true, tipoCorreo: true } });
    for (const u of usuarios) {
      const tipo = clasificarCorreo(u.correo, dominios);
      if (tipo !== u.tipoCorreo) {
        await prisma.usuario.update({ where: { id: u.id }, data: { tipoCorreo: tipo, ...(tipo === "PERSONAL" ? { correoPersonal: null } : {}) } });
        reclasificados++;
      }
    }
  }
  return { dominios, reclasificados };
}
