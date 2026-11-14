/** Unidad de despliegue 2: asistente-ia-service (se ejecuta con `npm run start:asistente`). */
import "dotenv/config";
import express from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { corsRestringido, securityHeaders } from "../middlewares/security.middleware";
import { authenticateStateless } from "../middlewares/auth.middleware";
import { errorMiddleware } from "../middlewares/error.middleware";
import { notFoundMiddleware } from "../middlewares/notFound.middleware";
import { crearAsistenteRouter } from "../modules/asistente/asistente.routes";

const app = express();
app.disable("x-powered-by");
if (env.trustProxy) app.set("trust proxy", 1);
app.use(securityHeaders, corsRestringido, express.json({ limit: "100kb" }));
app.get("/api/health", (_req, res) => res.json({ success: true, servicio: "asistente-ia", proveedor: env.ia.proveedor }));
app.use("/api/asistente", crearAsistenteRouter(authenticateStateless));
app.use(notFoundMiddleware, errorMiddleware);

const puerto = Number(process.env.ASISTENTE_PORT) || 4100;
prisma
  .$connect()
  .then(() => app.listen(puerto, () => console.log(`🤖 asistente-ia-service en http://localhost:${puerto} (casos vía ${env.coreApiUrl})`)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
