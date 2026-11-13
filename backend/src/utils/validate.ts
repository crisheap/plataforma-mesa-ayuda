import { z } from "zod";
import { AppError } from "./errors";

/** Valida y devuelve datos tipados; lanza AppError 400 con el detalle por campo. */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const r = esquema.safeParse(datos);
  if (r.success) return r.data;
  throw AppError.badRequest(
    "Error de validación",
    r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  );
}

export const idParam = (valor: unknown, nombre = "id"): number => {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) {
    throw AppError.badRequest(`El parámetro ${nombre} no es válido`);
  }
  return n;
};

export const paginacion = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
