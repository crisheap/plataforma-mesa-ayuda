import multer from "multer";
import { mkdirSync, openSync, readSync, closeSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { env } from "../../config/env";
import { AppError } from "../../utils/errors";

export const RAIZ_UPLOADS = path.resolve(env.uploadDir, "casos");

/** Tipos permitidos (RF-CAS-05): imágenes, documentos y videos. */
export const TIPOS_PERMITIDOS: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt", ".log"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
};

export const extensionValida = (mime: string, nombre: string) =>
  (TIPOS_PERMITIDOS[mime] ?? []).includes(path.extname(nombre).toLowerCase());

/** Verifica los primeros bytes para que el contenido real coincida con el tipo declarado. */
export function firmaValida(archivo: string, mime: string): boolean {
  const buf = Buffer.alloc(12);
  const fd = openSync(archivo, "r");
  try {
    readSync(fd, buf, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  const hex = buf.toString("hex");
  switch (mime) {
    case "image/png":
      return hex.startsWith("89504e470d0a1a0a");
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/gif":
      return hex.startsWith("474946383");
    case "image/webp":
      return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
    case "application/pdf":
      return buf.toString("ascii", 0, 5) === "%PDF-";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return hex.startsWith("504b0304");
    case "video/mp4":
      return buf.toString("ascii", 4, 8) === "ftyp";
    case "video/webm":
      return hex.startsWith("1a45dfa3");
    default:
      return true; // texto plano: sin firma
  }
}

export const subida = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const dir = path.join(RAIZ_UPLOADS, String(Number(req.params.id)));
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 5 },
  fileFilter(_req, file, cb) {
    if (extensionValida(file.mimetype, file.originalname)) return cb(null, true);
    cb(AppError.badRequest(`Tipo de archivo no permitido: ${file.originalname}`));
  },
});

/** Elimina archivos subidos cuando se rechaza la solicitud. */
export const descartar = (archivos: Express.Multer.File[]) =>
  archivos.forEach((a) => {
    try {
      unlinkSync(a.path);
    } catch {
      /* ya no existe */
    }
  });
