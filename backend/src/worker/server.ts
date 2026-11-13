/** Unidad de despliegue 3: notificaciones-worker (se ejecuta con `npm run start:worker`). */
import "dotenv/config";
import { prisma } from "../config/prisma";
import { iniciarWorker } from "../jobs/worker";

prisma.$connect().then(() => { iniciarWorker(); console.log("✓ notificaciones-worker en ejecución"); })
  .catch((e) => { console.error(e); process.exit(1); });
