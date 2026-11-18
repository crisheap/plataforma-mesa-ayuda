import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida en las variables de entorno");
}

// Grupo de conexiones: DB_POOL_MAX por proceso (por defecto 20). Súbelo junto con max_connections de PostgreSQL.
const max = Math.max(2, Number(process.env.DB_POOL_MAX) || 20);
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type Db = typeof prisma | Tx;
