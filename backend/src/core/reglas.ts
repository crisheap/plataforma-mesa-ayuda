import type { EstadoCaso, RolNombre } from "../generated/prisma/client";
import { mismoCentro } from "./centros";

export interface ContextoTransicion {
  estadoActual: EstadoCaso;
  destino: EstadoCaso;
  rol: RolNombre;
  esCreador: boolean;
  esTecnicoAsignado: boolean;
}
export type ResultadoTransicion = { ok: true; accion: "INICIAR" | "RESOLVER" | "CERRAR" | "RECHAZAR" } | { ok: false; motivo: string };

/**
 * Máquina de estados del caso (sección 8.3 del documento):
 *  ASIGNADO→EN_PROCESO (técnico asignado) · EN_PROCESO→RESUELTO (técnico asignado)
 *  RESUELTO→CERRADO (creador, supervisor o administrador) · RESUELTO→EN_PROCESO (creador rechaza)
 * La asignación (ABIERTO→ASIGNADO) tiene su propio flujo y no pasa por aquí.
 */
export function evaluarCambioEstado(c: ContextoTransicion): ResultadoTransicion {
  const { estadoActual: de, destino: a } = c;
  if (de === "CERRADO") return { ok: false, motivo: "El caso está cerrado y no admite cambios" };
  if (de === a) return { ok: false, motivo: `El caso ya está en estado ${a}` };

  if (de === "ASIGNADO" && a === "EN_PROCESO") {
    return c.esTecnicoAsignado
      ? { ok: true, accion: "INICIAR" }
      : { ok: false, motivo: "Solo el técnico asignado puede iniciar la atención" };
  }
  if (de === "EN_PROCESO" && a === "RESUELTO") {
    return c.esTecnicoAsignado
      ? { ok: true, accion: "RESOLVER" }
      : { ok: false, motivo: "Solo el técnico asignado puede marcar el caso como resuelto" };
  }
  if (de === "RESUELTO" && a === "CERRADO") {
    return c.esCreador || c.rol === "SUPERVISOR" || c.rol === "ADMINISTRADOR"
      ? { ok: true, accion: "CERRAR" }
      : { ok: false, motivo: "Solo quien creó el caso, un dinamizador TICs o un administrador pueden cerrarlo" };
  }
  if (de === "RESUELTO" && a === "EN_PROCESO") {
    return c.esCreador ? { ok: true, accion: "RECHAZAR" } : { ok: false, motivo: "Solo quien creó el caso puede rechazar la solución" };
  }
  return { ok: false, motivo: `Transición no permitida: ${de} → ${a}` };
}

export interface CasoAcceso {
  usuarioId: number;
  tecnicoId: number | null;
  centroId: number;
}

/**
 * Control de propiedad (H-05) y de centro (RF-CEN-02): quién puede ver/trabajar un caso.
 * Supervisores y administradores, solo los de su centro; el administrador general, todos.
 */
export function puedeVerCaso(u: { userId: number; rol: RolNombre; centroId: number | null }, caso: CasoAcceso): boolean {
  if (u.rol === "ADMINISTRADOR" || u.rol === "SUPERVISOR") return mismoCentro(u, caso.centroId);
  if (u.rol === "TECNICO") return caso.tecnicoId === u.userId;
  return caso.usuarioId === u.userId;
}

export const esPersonalInterno = (rol: RolNombre) => rol !== "USUARIO";

export const ESTADOS_ABIERTOS: EstadoCaso[] = ["ABIERTO", "ASIGNADO", "EN_PROCESO"];

export { formatearNumeroCaso } from "./centros";
