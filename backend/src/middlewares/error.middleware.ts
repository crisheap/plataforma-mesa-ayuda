import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { AppError } from "../utils/errors";
import { env } from "../config/env";

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, errors: err.errors });
  }
  if (err instanceof MulterError) {
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? `El archivo supera el máximo de ${env.maxUploadMb} MB`
        : err.code === "LIMIT_FILE_COUNT"
          ? "Máximo 5 archivos por solicitud"
          : "Error al cargar el archivo";
    return res.status(400).json({ success: false, message: msg });
  }
  const e = err as { type?: string; status?: number; code?: string };
  if (e?.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "El cuerpo de la solicitud no es un JSON válido" });
  }
  if (e?.code === "P2002") {
    return res.status(409).json({ success: false, message: "Ya existe un registro con esos datos" });
  }
  console.error("[error]", err);
  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
    ...(env.esProduccion ? {} : { detail: String((err as Error)?.message ?? err) }),
  });
}
