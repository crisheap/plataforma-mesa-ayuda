import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import type { RolNombre } from "../generated/prisma/client";
import { env } from "../config/env";

export interface JwtPayload {
  userId: number;
  correo: string;
  rol: RolNombre;
}

export function firmarAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.accessExpiresIn as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  });
}

export function verificarAccessToken(token: string): JwtPayload {
  const d = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  return { userId: Number(d.userId), correo: String(d.correo), rol: d.rol as RolNombre };
}

export const generarRefreshToken = () => randomBytes(48).toString("hex");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
