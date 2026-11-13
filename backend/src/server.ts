import "dotenv/config";
import app from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { iniciarWorker } from "./jobs/worker";

async function iniciar() {
  try {
    await prisma.$connect();
    console.log("✓ Conexión con PostgreSQL establecida");
    const detener = env.runWorker ? iniciarWorker() : () => undefined;
    const servidor = app.listen(env.port, () => {
      console.log(`🚀 API ejecutándose en http://localhost:${env.port}`);
      console.log(`❤️ Health check: http://localhost:${env.port}/api/health`);
      if (env.embedAsistente) console.log(`🤖 Asistente IA embebido (proveedor: ${env.ia.proveedor})`);
    });
    const apagar = async () => {
      detener();
      servidor.close(async () => { await prisma.$disconnect(); process.exit(0); });
    };
    process.on("SIGTERM", apagar);
    process.on("SIGINT", apagar);
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  }
}
iniciar();
