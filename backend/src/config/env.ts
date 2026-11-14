import "dotenv/config";

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno obligatoria: ${nombre}`);
  return valor;
}
const numero = (nombre: string, defecto: number): number => {
  const n = Number(process.env[nombre]);
  return Number.isFinite(n) && process.env[nombre] ? n : defecto;
};
const booleano = (nombre: string, defecto: boolean): boolean => {
  const v = process.env[nombre];
  return v === undefined || v === "" ? defecto : ["1", "true", "si", "sí"].includes(v.toLowerCase());
};
const lista = (nombre: string): string[] =>
  (process.env[nombre] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = requerida("JWT_SECRET");
if (nodeEnv === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET debe tener al menos 32 caracteres en producción");
}

export const env = {
  nodeEnv,
  esProduccion: nodeEnv === "production",
  port: numero("PORT", 4000),
  jwtSecret,
  accessExpiresIn: process.env.JWT_EXPIRES_IN ?? "15m",
  refreshDias: numero("REFRESH_TOKEN_DAYS", 7),
  corsOrigins: lista("CORS_ORIGINS"),
  trustProxy: booleano("TRUST_PROXY", false),
  frontendDir: process.env.FRONTEND_DIR ?? "../frontend",

  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  maxUploadMb: numero("MAX_UPLOAD_MB", 10),

  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: numero("SMTP_PORT", 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Mesa de Ayuda SENA <no-reply@mesaayuda.local>",
  },
  vapid: {
    publica: process.env.VAPID_PUBLIC_KEY ?? "",
    privada: process.env.VAPID_PRIVATE_KEY ?? "",
    asunto: process.env.VAPID_SUBJECT ?? "mailto:soporte@mesaayuda.local",
  },

  ia: {
    proveedor: (process.env.IA_PROVIDER ?? "local") as "local" | "anthropic",
    apiKey: process.env.IA_API_KEY ?? "",
    modelo: process.env.IA_MODEL ?? "",
    maxMensajesPorMinuto: numero("IA_MAX_MENSAJES_MIN", 20),
  },
  coreApiUrl: process.env.CORE_API_URL ?? `http://localhost:${numero("PORT", 4000)}`,
  embedAsistente: booleano("EMBED_ASISTENTE", true),
  runWorker: booleano("RUN_WORKER", true),
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD ?? "",

  // Retención de las conversaciones de Botito (RF-IA-07, RNF-13). 0 = no borrar nunca.
  asistenteRetencionDias: Math.max(0, numero("ASISTENTE_RETENCION_DIAS", 180)),

  // Observabilidad (RNF-14)
  logPeticiones: (["json", "texto", "no"].includes(process.env.LOG_PETICIONES ?? "")
    ? process.env.LOG_PETICIONES
    : nodeEnv === "production"
      ? "json"
      : "no") as "json" | "texto" | "no",
  metricsToken: process.env.METRICS_TOKEN ?? "",
  // Peticiones por minuto y por IP a /api (súbelo detrás de un proxy que agrupe usuarios o en pruebas de carga).
  rateLimitApiMin: Math.max(1, numero("RATE_LIMIT_API_MIN", 600)),
} as const;
