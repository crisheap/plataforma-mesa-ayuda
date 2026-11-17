import { env } from "../config/env";

/**
 * Política de tratamiento de datos personales (RF-DAT-01).
 * Ley Estatutaria 1581 de 2012 y Decreto 1377 de 2013, compilado en el Decreto Único 1074 de 2015.
 * Al cambiar la política de forma sustancial, sube la versión: todos deberán autorizar de nuevo.
 */
export const POLITICA_DATOS_VERSION = "2026-11-17";

export const politicaDatos = () => ({
  version: POLITICA_DATOS_VERSION,
  responsable: env.datosResponsable,
  contacto: env.datosContacto || null,
  normas: [
    "Constitución Política de Colombia, artículos 15 y 20",
    "Ley Estatutaria 1581 de 2012",
    "Decreto 1377 de 2013, compilado en el Decreto Único Reglamentario 1074 de 2015",
  ],
});

export const autorizacionVigente = (u: { datosAutorizadosEn: Date | null; datosVersion: string | null }) =>
  u.datosAutorizadosEn !== null && u.datosVersion === POLITICA_DATOS_VERSION;
