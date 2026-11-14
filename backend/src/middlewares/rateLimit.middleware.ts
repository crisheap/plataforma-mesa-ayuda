import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../utils/errors";

interface Opciones {
  ventanaMs: number;
  max: number;
  /** Clave de agrupación; por defecto la IP. */
  clave?: (req: Request) => string;
  mensaje?: string;
}

/** Limitador de ventana fija en memoria (una instancia). Para varias réplicas usar Redis. */
export function rateLimit(op: Opciones): RequestHandler & { _reset: () => void } {
  const cubos = new Map<string, { inicio: number; n: number }>();
  const limpieza = setInterval(
    () => {
      const ahora = Date.now();
      for (const [k, v] of cubos) if (ahora - v.inicio > op.ventanaMs) cubos.delete(k);
    },
    Math.max(op.ventanaMs, 60_000),
  );
  limpieza.unref();

  const mw = (req: Request, res: Response, next: NextFunction) => {
    const clave = op.clave ? op.clave(req) : (req.ip ?? "desconocida");
    const ahora = Date.now();
    let c = cubos.get(clave);
    if (!c || ahora - c.inicio >= op.ventanaMs) {
      c = { inicio: ahora, n: 0 };
      cubos.set(clave, c);
    }
    c.n++;
    res.setHeader("X-RateLimit-Limit", String(op.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, op.max - c.n)));
    if (c.n > op.max) {
      res.setHeader("Retry-After", String(Math.ceil((c.inicio + op.ventanaMs - ahora) / 1000)));
      throw AppError.tooMany(op.mensaje);
    }
    next();
  };
  (mw as RequestHandler & { _reset: () => void })._reset = () => cubos.clear();
  return mw as RequestHandler & { _reset: () => void };
}
