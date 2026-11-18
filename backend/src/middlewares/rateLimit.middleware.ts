import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../utils/errors";

interface Opciones {
  ventanaMs: number;
  max: number;
  /** Clave de agrupación; por defecto la IP. */
  clave?: (req: Request) => string;
  mensaje?: string;
  /** Cuenta solo las respuestas fallidas (401, 403, 400): un centro entero tras una IP no se bloquea al ingresar bien. */
  soloFallidos?: boolean;
  /** Se llama una vez por ventana cuando una clave supera el límite (eventos de seguridad, RF-SEG-02). */
  alExceder?: (req: Request, clave: string) => void;
}

/** Limitador de ventana fija en memoria (una instancia). Para varias réplicas usar Redis. */
export function rateLimit(op: Opciones): RequestHandler & { _reset: () => void } {
  const cubos = new Map<string, { inicio: number; n: number; avisado: boolean }>();
  const exceder = (req: Request, res: Response, clave: string, c: { inicio: number; avisado: boolean }, ahora: number) => {
    res.setHeader("Retry-After", String(Math.ceil((c.inicio + op.ventanaMs - ahora) / 1000)));
    if (!c.avisado) {
      c.avisado = true;
      op.alExceder?.(req, clave);
    }
    throw AppError.tooMany(op.mensaje);
  };
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
      c = { inicio: ahora, n: 0, avisado: false };
      cubos.set(clave, c);
    }
    const cubo = c;
    if (op.soloFallidos) {
      // Se rechaza si ya acumuló el máximo de fallos; el contador sube al terminar una respuesta fallida.
      if (cubo.n >= op.max) return exceder(req, res, clave, cubo, ahora);
      res.on("finish", () => {
        if (res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 403) cubo.n++;
      });
      return next();
    }
    cubo.n++;
    res.setHeader("X-RateLimit-Limit", String(op.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, op.max - cubo.n)));
    if (cubo.n > op.max) return exceder(req, res, clave, cubo, ahora);
    next();
  };
  (mw as RequestHandler & { _reset: () => void })._reset = () => cubos.clear();
  return mw as RequestHandler & { _reset: () => void };
}
