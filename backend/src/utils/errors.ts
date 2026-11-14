export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: { field?: string; message: string }[],
  ) {
    super(message);
    this.name = "AppError";
  }
  static badRequest(m: string, e?: AppError["errors"]) {
    return new AppError(400, m, e);
  }
  static unauthorized(m = "No autenticado") {
    return new AppError(401, m);
  }
  static forbidden(m = "No tienes permisos para realizar esta acción") {
    return new AppError(403, m);
  }
  static notFound(m = "Recurso no encontrado") {
    return new AppError(404, m);
  }
  static conflict(m: string) {
    return new AppError(409, m);
  }
  static tooMany(m = "Demasiadas solicitudes. Intenta de nuevo más tarde") {
    return new AppError(429, m);
  }
}
