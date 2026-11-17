import type { RolNombre } from "../generated/prisma/client";

/**
 * Alcance por centro (RF-CEN-02). Cada consulta de personal se limita al centro de quien la hace;
 * solo el administrador general (ADMINISTRADOR sin centro) ve todos los centros.
 */
export interface Alcance {
  userId: number;
  rol: RolNombre;
  centroId: number | null;
}

export const esGeneral = (a: Pick<Alcance, "rol" | "centroId">) => a.rol === "ADMINISTRADOR" && a.centroId === null;

/**
 * Filtro de centro para consultas. El general ve todo o el centro que elija; los demás, solo el suyo.
 * Una cuenta sin centro que no sea el general no ve nada (falla cerrada).
 */
export function filtroCentro(a: Pick<Alcance, "rol" | "centroId">, elegido?: number): { centroId?: number } {
  if (esGeneral(a)) return elegido ? { centroId: elegido } : {};
  return { centroId: a.centroId ?? -1 };
}

/** ¿El actor puede ver algo que pertenece a ese centro? */
export const mismoCentro = (a: Pick<Alcance, "rol" | "centroId">, centroId: number | null) =>
  esGeneral(a) || (a.centroId !== null && a.centroId === centroId);

/** Roles que puede crear o administrar cada tipo de administrador (RF-CEN-03). */
export const rolesGestionables = (a: Pick<Alcance, "rol" | "centroId">): RolNombre[] =>
  esGeneral(a) ? ["USUARIO", "TECNICO", "SUPERVISOR", "ADMINISTRADOR"] : ["USUARIO", "TECNICO", "SUPERVISOR"];

/** ¿El actor puede modificar a esa cuenta? El general, a todas menos a sí mismo en lo sensible; el de centro, a las no administradoras de su centro. */
export function puedeGestionar(a: Alcance, objetivo: { id: number; rol: RolNombre; centroId: number | null }): boolean {
  if (objetivo.centroId === null && objetivo.rol === "ADMINISTRADOR") return objetivo.id === a.userId; // la cuenta general solo se toca a sí misma
  if (esGeneral(a)) return true;
  return objetivo.centroId === a.centroId && objetivo.rol !== "ADMINISTRADOR";
}

export const CODIGO_CENTRO = /^[A-Z][A-Z0-9]{1,9}$/;

export const formatearNumeroCaso = (codigo: string, anio: number, n: number) => `${codigo}-${anio}-${String(n).padStart(6, "0")}`;
