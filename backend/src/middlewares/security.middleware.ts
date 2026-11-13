import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

/** Cabeceras de seguridad (equivalente básico a helmet; RNF-01). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  if (env.esProduccion) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  res.removeHeader("X-Powered-By");
  next();
}

/** CORS restringido a los orígenes de CORS_ORIGINS (el mismo origen siempre se permite). */
export const corsRestringido = cors({
  origin(origin, cb) {
    if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: false,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
});
