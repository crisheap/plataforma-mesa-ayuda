import type { EstadoCaso } from "../generated/prisma/client";

export type Semaforo = "EN_TIEMPO" | "EN_RIESGO" | "VENCIDO" | "CUMPLIDO" | "INCUMPLIDO" | "SIN_SLA";
export const UMBRAL_RIESGO = 0.75;

export const calcularVencimiento = (inicio: Date, minutos: number) => new Date(inicio.getTime() + minutos * 60_000);

/** Indicador visual de SLA (RF-ADM-01). */
export function semaforoSla(
  c: { estado: EstadoCaso; fechaCreacion: Date; slaVenceEn: Date | null; fechaResolucion: Date | null },
  ahora = new Date(),
): Semaforo {
  if (!c.slaVenceEn) return "SIN_SLA";
  if (c.estado === "RESUELTO" || c.estado === "CERRADO") {
    const fin = c.fechaResolucion ?? ahora;
    return fin <= c.slaVenceEn ? "CUMPLIDO" : "INCUMPLIDO";
  }
  if (ahora > c.slaVenceEn) return "VENCIDO";
  const total = c.slaVenceEn.getTime() - c.fechaCreacion.getTime();
  const usado = ahora.getTime() - c.fechaCreacion.getTime();
  return total > 0 && usado / total >= UMBRAL_RIESGO ? "EN_RIESGO" : "EN_TIEMPO";
}

export const minutosRestantes = (venceEn: Date | null, ahora = new Date()) =>
  venceEn ? Math.round((venceEn.getTime() - ahora.getTime()) / 60_000) : null;

export const SLA_POR_DEFECTO = { ALTA: 240, MEDIA: 480, BAJA: 1440 } as const; // minutos
