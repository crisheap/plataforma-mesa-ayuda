import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import type { RolNombre } from "../generated/prisma/client";
import { env } from "../config/env";

export interface JwtPayload {
  userId: number;
  correo: string;
  rol: RolNombre;
  /** Centro del usuario; null solo para el administrador general (RF-CEN-02). */
  centroId?: number | null;
  /** Emisión del token (segundos); lo usa el cierre de sesiones de emergencia. */
  iat?: number;
}

export function firmarAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.accessExpiresIn as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  });
}

export function verificarAccessToken(token: string): JwtPayload {
  const d = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  return {
    userId: Number(d.userId),
    correo: String(d.correo),
    rol: d.rol as RolNombre,
    // Tokens anteriores a los centros no traen el campo: queda undefined y no cuenta como general.
    centroId: d.centroId === null ? null : typeof d.centroId === "number" ? d.centroId : undefined,
    iat: typeof d.iat === "number" ? d.iat : undefined,
  };
}

export const generarRefreshToken = () => randomBytes(48).toString("hex");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
