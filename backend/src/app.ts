import express, { type Application } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { corsRestringido, securityHeaders } from "./middlewares/security.middleware";
import { rateLimit } from "./middlewares/rateLimit.middleware";
import { errorMiddleware } from "./middlewares/error.middleware";
import { notFoundMiddleware } from "./middlewares/notFound.middleware";
import { authenticate } from "./middlewares/auth.middleware";
import authRoutes from "./modules/auth/auth.routes";
import usuarioRoutes from "./modules/usuarios/usuarios.routes";
import roleRoutes from "./modules/roles/roles.routes";
import casoRoutes from "./modules/casos/casos.routes";
import slaRoutes from "./modules/sla/sla.routes";
import auditoriaRoutes from "./modules/auditoria/auditoria.routes";
import reportesRoutes from "./modules/reportes/reportes.routes";
import { notificacionesRouter, pushRouter } from "./modules/notificaciones/notificaciones.routes";
import { crearAsistenteRouter } from "./modules/asistente/asistente.routes";
import { metricasTexto, observarPeticiones, tokenMetricasValido } from "./core/observabilidad";
import { construirOpenApi } from "./docs/openapi";

const PAGINA_DOCS = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>API · Plataforma Mesa de Ayuda</title><link rel="stylesheet" href="/api/docs/recursos/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="/api/docs/recursos/swagger-ui-bundle.js"></script><script src="/api/docs/inicio.js"></script></body></html>`;

export function crearApp(): Application {
  const app = express();
  app.disable("x-powered-by");
  if (env.trustProxy) app.set("trust proxy", 1);

  app.use(observarPeticiones);
  app.use(securityHeaders);
  app.use(corsRestringido);
  app.use(express.json({ limit: "1mb" }));

  // Health check ANTES de los middlewares finales (corrige H-01). «?deep=1» verifica la base de datos.
  app.get("/api/health", async (req, res) => {
    let db: "ok" | "error" | "omitido" = "omitido";
    if (req.query.deep) {
      try { await prisma.$queryRaw`SELECT 1`; db = "ok"; } catch { db = "error"; }
    }
    res.status(db === "error" ? 503 : 200).json({
      success: db !== "error", message: "API de Plataforma Mesa de Ayuda", servicio: "api-core", db, timestamp: new Date().toISOString(),
    });
  });

  // Métricas para Prometheus (RNF-14): deshabilitadas si no se define METRICS_TOKEN.
  app.get("/api/metrics", async (req, res) => {
    if (!env.metricsToken) return res.status(404).json({ success: false, message: "Métricas deshabilitadas (define METRICS_TOKEN)" });
    if (!tokenMetricasValido(req.headers.authorization)) return res.status(401).json({ success: false, message: "Token de métricas inválido" });
    res.type("text/plain; version=0.0.4").send(await metricasTexto());
  });

  // Contrato OpenAPI y documentación navegable (RNF-06).
  const contrato = construirOpenApi();
  app.get("/api/openapi.json", (_req, res) => { res.json(contrato); });
  const swaggerUi = path.dirname(require.resolve("swagger-ui-dist/package.json"));
  const cspDocs = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";
  app.get(["/api/docs", "/api/docs/"], (_req, res) => {
    res.setHeader("Content-Security-Policy", cspDocs);
    res.type("html").send(PAGINA_DOCS);
  });
  app.get("/api/docs/inicio.js", (_req, res) => {
    res.type("application/javascript").send('window.ui = SwaggerUIBundle({ url: "/api/openapi.json", dom_id: "#swagger-ui", deepLinking: true });');
  });
  app.use("/api/docs/recursos", (_req, res, next) => { res.setHeader("Content-Security-Policy", cspDocs); next(); }, express.static(swaggerUi, { index: false }));

  app.use("/api", rateLimit({ ventanaMs: 60_000, max: env.rateLimitApiMin, mensaje: "Demasiadas solicitudes. Intenta en un minuto" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/usuarios", usuarioRoutes);
  app.use("/api/roles", roleRoutes);
  app.use("/api/casos", casoRoutes);
  app.use("/api/notificaciones", notificacionesRouter);
  app.use("/api/push", pushRouter);
  app.use("/api/sla", slaRoutes);
  app.use("/api/auditoria", auditoriaRoutes);
  app.use("/api/reportes", reportesRoutes);
  if (env.embedAsistente) app.use("/api/asistente", crearAsistenteRouter(authenticate));

  // Frontend PWA (archivos estáticos) si existe la carpeta configurada.
  const frontend = path.resolve(process.cwd(), env.frontendDir);
  if (existsSync(path.join(frontend, "index.html"))) {
    app.use(express.static(frontend, {
      index: "index.html",
      setHeaders(res, ruta) {
        // El service worker y el manifiesto nunca deben quedar en caché larga.
        if (/(sw\.js|manifest\.webmanifest|index\.html)$/.test(ruta)) res.setHeader("Cache-Control", "no-cache");
      },
    }));
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}

export default crearApp();
